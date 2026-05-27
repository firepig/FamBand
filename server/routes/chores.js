import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer config: store in public/photos/, filename = UUID + ext
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.resolve(__dirname, '..', '..', 'public', 'photos');
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  },
});
const upload = multer({ storage });

const router = Router();

// Helper to fetch a chore with all relations
function getChoreWithRelations(db, id) {
  const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(id);
  if (!chore) return null;

  const assignments = db.prepare(
    `SELECT fm.id, fm.name, fm.avatar, fm.color, fm.role
     FROM family_members fm
     JOIN chore_assignments ca ON fm.id = ca.member_id
     WHERE ca.chore_id = ?`
  ).all(id);

  const checklist = db.prepare(
    'SELECT * FROM checklist_items WHERE chore_id = ? ORDER BY rowid ASC'
  ).all(id);

  return { ...chore, assignments, checklist };
}

// GET / — list all chores with optional status filter
router.get('/', (req, res) => {
  try {
    const db = getDb();
    let chores;
    if (req.query.status) {
      chores = db.prepare('SELECT * FROM chores WHERE status = ? ORDER BY created_at DESC').all(req.query.status);
    } else {
      chores = db.prepare('SELECT * FROM chores ORDER BY created_at DESC').all();
    }

    const result = chores.map((chore) => {
      const assignments = db.prepare(
        `SELECT fm.id, fm.name, fm.avatar, fm.color, fm.role
         FROM family_members fm
         JOIN chore_assignments ca ON fm.id = ca.member_id
         WHERE ca.chore_id = ?`
      ).all(chore.id);

      const checklist = db.prepare(
        'SELECT * FROM checklist_items WHERE chore_id = ? ORDER BY rowid ASC'
      ).all(chore.id);

      return { ...chore, assignments, checklist };
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching chores:', err);
    res.status(500).json({ error: 'Failed to fetch chores' });
  }
});

// POST / — create chore
router.post('/', (req, res) => {
  try {
    const { title, description, points, assignedTo, dueDate, category, checklist, createdBy } = req.body;

    if (!title || !createdBy) {
      return res.status(400).json({ error: 'Title and createdBy are required' });
    }

    const db = getDb();
    const choreId = uuidv4();

    const insertChore = db.prepare(
      `INSERT INTO chores (id, title, description, points, created_by, due_date, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAssignment = db.prepare(
      'INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)'
    );

    const insertChecklist = db.prepare(
      'INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      insertChore.run(
        choreId,
        title,
        description || '',
        points || 10,
        createdBy,
        dueDate || null,
        category || 'general'
      );

      if (assignedTo && Array.isArray(assignedTo) && assignedTo.length > 0) {
        for (const memberId of assignedTo) {
          insertAssignment.run(choreId, memberId);
        }
      }

      if (checklist && Array.isArray(checklist) && checklist.length > 0) {
        for (const item of checklist) {
          if (item.text) {
            insertChecklist.run(uuidv4(), choreId, item.text);
          }
        }
      }
    });

    transaction();

    const result = getChoreWithRelations(db, choreId);
    res.status(201).json(result);
  } catch (err) {
    console.error('Error creating chore:', err);
    res.status(500).json({ error: 'Failed to create chore' });
  }
});

// PATCH /:id — update chore fields
router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);

    if (!chore) {
      return res.status(404).json({ error: 'Chore not found' });
    }

    const { title, description, points, status, dueDate, category, assignedTo } = req.body;

    // Track if status is changing to 'done'
    const statusChangingToDone = status === 'done' && chore.status !== 'done';

    const updateFields = [];
    const updateValues = [];

    if (title !== undefined) { updateFields.push('title = ?'); updateValues.push(title); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (points !== undefined) { updateFields.push('points = ?'); updateValues.push(points); }
    if (status !== undefined) { updateFields.push('status = ?'); updateValues.push(status); }
    if (dueDate !== undefined) { updateFields.push('due_date = ?'); updateValues.push(dueDate); }
    if (category !== undefined) { updateFields.push('category = ?'); updateValues.push(category); }

    const transaction = db.transaction(() => {
      if (updateFields.length > 0) {
        updateValues.push(req.params.id);
        db.prepare(
          `UPDATE chores SET ${updateFields.join(', ')} WHERE id = ?`
        ).run(...updateValues);
      }

      if (assignedTo && Array.isArray(assignedTo)) {
        db.prepare('DELETE FROM chore_assignments WHERE chore_id = ?').run(req.params.id);
        const insertAssignment = db.prepare(
          'INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)'
        );
        for (const memberId of assignedTo) {
          insertAssignment.run(req.params.id, memberId);
        }
      }

      // When chore status changes to 'done', insert escrow points for each assigned member
      if (statusChangingToDone) {
        const updatedChore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);
        const assignments = db.prepare(
          'SELECT member_id FROM chore_assignments WHERE chore_id = ?'
        ).all(req.params.id);

        const insertLedger = db.prepare(
          `INSERT INTO points_ledger (id, member_id, amount, type, chore_id, description)
           VALUES (?, ?, ?, 'escrow', ?, ?)`
        );

        for (const assignment of assignments) {
          // Check if escrow already exists for this member+chore to avoid duplicates
          const existing = db.prepare(
            "SELECT id FROM points_ledger WHERE member_id = ? AND chore_id = ? AND type = 'escrow'"
          ).get(assignment.member_id, req.params.id);

          if (!existing) {
            insertLedger.run(
              uuidv4(),
              assignment.member_id,
              updatedChore.points,
              req.params.id,
              `Escrow: ${updatedChore.title}`
            );
          }
        }
      }
    });

    transaction();

    const result = getChoreWithRelations(db, req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Error updating chore:', err);
    res.status(500).json({ error: 'Failed to update chore' });
  }
});

// DELETE /:id — delete chore
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);

    if (!chore) {
      return res.status(404).json({ error: 'Chore not found' });
    }

    db.prepare('DELETE FROM chores WHERE id = ?').run(req.params.id);
    res.json({ message: 'Chore deleted successfully' });
  } catch (err) {
    console.error('Error deleting chore:', err);
    res.status(500).json({ error: 'Failed to delete chore' });
  }
});

// POST /:id/checklist — add checklist item
router.post('/:id/checklist', (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);

    if (!chore) {
      return res.status(404).json({ error: 'Chore not found' });
    }

    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const itemId = uuidv4();
    db.prepare(
      'INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)'
    ).run(itemId, req.params.id, text);

    const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(itemId);
    res.status(201).json(item);
  } catch (err) {
    console.error('Error adding checklist item:', err);
    res.status(500).json({ error: 'Failed to add checklist item' });
  }
});

// PATCH /:id/checklist/:itemId — toggle checklist item
router.patch('/:id/checklist/:itemId', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM checklist_items WHERE id = ? AND chore_id = ?')
      .get(req.params.itemId, req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    const newCompleted = item.completed ? 0 : 1;
    db.prepare(
      'UPDATE checklist_items SET completed = ? WHERE id = ?'
    ).run(newCompleted, req.params.itemId);

    const updated = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(req.params.itemId);
    res.json(updated);
  } catch (err) {
    console.error('Error toggling checklist item:', err);
    res.status(500).json({ error: 'Failed to toggle checklist item' });
  }
});

// POST /:id/photo — upload photo proof
router.post('/:id/photo', upload.single('photo'), (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);

    if (!chore) {
      return res.status(404).json({ error: 'Chore not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    const filename = req.file.filename;
    db.prepare('UPDATE chores SET photo_proof = ? WHERE id = ?').run(filename, req.params.id);

    res.json({ photoUrl: '/photos/' + filename });
  } catch (err) {
    console.error('Error uploading photo:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// POST /:id/approve — approve chore points
router.post('/:id/approve', (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);

    if (!chore) {
      return res.status(404).json({ error: 'Chore not found' });
    }

    const { approvedBy } = req.body;
    if (!approvedBy) {
      return res.status(400).json({ error: 'approvedBy is required' });
    }

    const transaction = db.transaction(() => {
      // Update chore approval
      db.prepare(
        'UPDATE chores SET points_approved = 1, approved_by = ? WHERE id = ?'
      ).run(approvedBy, req.params.id);

      // Find escrow entries and release them
      const assignments = db.prepare(
        'SELECT member_id FROM chore_assignments WHERE chore_id = ?'
      ).all(req.params.id);

      const insertLedger = db.prepare(
        `INSERT INTO points_ledger (id, member_id, amount, type, chore_id, description, approved_by)
         VALUES (?, ?, ?, 'released', ?, ?, ?)`
      );

      // Also replace any escrow entries with released
      const escrowEntries = db.prepare(
        "SELECT * FROM points_ledger WHERE chore_id = ? AND type = 'escrow'"
      ).all(req.params.id);

      if (escrowEntries.length > 0) {
        // Clear existing escrows for this chore
        db.prepare(
          "DELETE FROM points_ledger WHERE chore_id = ? AND type = 'escrow'"
        ).run(req.params.id);
      }

      // Create released entries for assigned members
      for (const assignment of assignments) {
        insertLedger.run(
          uuidv4(),
          assignment.member_id,
          chore.points,
          req.params.id,
          `Released: ${chore.title}`,
          approvedBy
        );
      }
    });

    transaction();

    const updated = getChoreWithRelations(db, req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error approving chore:', err);
    res.status(500).json({ error: 'Failed to approve chore' });
  }
});

// POST /:id/reject — reject photo proof
router.post('/:id/reject', (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);

    if (!chore) {
      return res.status(404).json({ error: 'Chore not found' });
    }

    db.prepare('UPDATE chores SET photo_proof = NULL WHERE id = ?').run(req.params.id);

    const updated = getChoreWithRelations(db, req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error rejecting photo:', err);
    res.status(500).json({ error: 'Failed to reject photo' });
  }
});

export default router;
