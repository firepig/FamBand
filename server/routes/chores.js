import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { materializeChores } from '../lib/materialize.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';
import { imageUpload, deleteUpload, uploadExists, releaseQuestImage } from '../lib/uploads.js';

const router = Router();

function getChoreWithRelations(db, id, familyId) {
  const chore = db.prepare('SELECT * FROM chores WHERE id = ? AND family_id = ?').get(id, familyId);
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

function assertFamilyMember(db, memberId, familyId) {
  const m = db.prepare('SELECT id FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId);
  return !!m;
}

// GET / — list family's chores
router.get('/', (req, res) => {
  try {
    const db = getDb();
    try { materializeChores(db, req.familyId); } catch (mErr) { console.error('materialize error:', mErr); }
    const chores = req.query.status
      ? db.prepare('SELECT * FROM chores WHERE family_id = ? AND status = ? ORDER BY created_at DESC')
          .all(req.familyId, req.query.status)
      : db.prepare('SELECT * FROM chores WHERE family_id = ? ORDER BY created_at DESC').all(req.familyId);

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

// POST / — create chore (parent only)
router.post('/', requireActiveMember, requireParent, (req, res) => {
  try {
    const { title, description, points, assignedTo, dueDate, category, checklist, image } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (image != null && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });

    const db = getDb();
    const choreId = uuidv4();

    const insertChore = db.prepare(
      `INSERT INTO chores (id, family_id, title, description, points, created_by, due_date, category, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAssignment = db.prepare(
      'INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)'
    );
    const insertChecklist = db.prepare(
      'INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)'
    );

    db.transaction(() => {
      insertChore.run(
        choreId, req.familyId, title, description || '', points || 10,
        req.currentMember.id, dueDate || null, category || 'general', image || null
      );
      if (Array.isArray(assignedTo)) {
        for (const memberId of assignedTo) {
          if (assertFamilyMember(db, memberId, req.familyId)) insertAssignment.run(choreId, memberId);
        }
      }
      if (Array.isArray(checklist)) {
        for (const item of checklist) {
          if (item?.text) insertChecklist.run(uuidv4(), choreId, item.text);
        }
      }
    })();

    res.status(201).json(getChoreWithRelations(db, choreId, req.familyId));
  } catch (err) {
    console.error('Error creating chore:', err);
    res.status(500).json({ error: 'Failed to create chore' });
  }
});

// PATCH /:id — update chore
// Kids may change status (e.g. mark in_progress/done); parents may change anything.
router.patch('/:id', requireActiveMember, (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });

    const { title, description, points, status, dueDate, category, assignedTo, image } = req.body;
    const isParent = req.currentMember.role === 'parent';
    const touchesParentOnly =
      title !== undefined || description !== undefined || points !== undefined ||
      dueDate !== undefined || category !== undefined || assignedTo !== undefined ||
      image !== undefined;
    if (touchesParentOnly && !isParent) {
      return res.status(403).json({ error: 'Parent access required for these fields' });
    }

    if (image != null && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });

    const statusChangingToDone = status === 'done' && chore.status !== 'done';

    const updateFields = [];
    const updateValues = [];
    if (title !== undefined) { updateFields.push('title = ?'); updateValues.push(title); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (points !== undefined) { updateFields.push('points = ?'); updateValues.push(points); }
    if (status !== undefined) { updateFields.push('status = ?'); updateValues.push(status); }
    if (dueDate !== undefined) { updateFields.push('due_date = ?'); updateValues.push(dueDate); }
    if (category !== undefined) { updateFields.push('category = ?'); updateValues.push(category); }
    if (image !== undefined) { updateFields.push('image = ?'); updateValues.push(image || null); }

    db.transaction(() => {
      if (updateFields.length > 0) {
        updateValues.push(req.params.id);
        db.prepare(`UPDATE chores SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);
      }
      if (Array.isArray(assignedTo)) {
        db.prepare('DELETE FROM chore_assignments WHERE chore_id = ?').run(req.params.id);
        const ins = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)');
        for (const memberId of assignedTo) {
          if (assertFamilyMember(db, memberId, req.familyId)) ins.run(req.params.id, memberId);
        }
      }
      if (statusChangingToDone) {
        const updated = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);
        const assignments = db.prepare('SELECT member_id FROM chore_assignments WHERE chore_id = ?').all(req.params.id);
        const insertLedger = db.prepare(
          `INSERT INTO points_ledger (id, family_id, member_id, amount, type, chore_id, description)
           VALUES (?, ?, ?, ?, 'escrow', ?, ?)`
        );
        for (const a of assignments) {
          const existing = db.prepare(
            "SELECT id FROM points_ledger WHERE member_id = ? AND chore_id = ? AND type = 'escrow'"
          ).get(a.member_id, req.params.id);
          if (!existing) {
            insertLedger.run(uuidv4(), req.familyId, a.member_id, updated.points, req.params.id, `Escrow: ${updated.title}`);
          }
        }
      }
    })();

    if (image !== undefined && chore.image && chore.image !== image) releaseQuestImage(db, chore.image);

    res.json(getChoreWithRelations(db, req.params.id, req.familyId));
  } catch (err) {
    console.error('Error updating chore:', err);
    res.status(500).json({ error: 'Failed to update chore' });
  }
});

// DELETE /:id — parent only
router.delete('/:id', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT id, image, photo_proof FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });
    db.prepare('DELETE FROM chores WHERE id = ?').run(req.params.id);
    deleteUpload('photo', chore.photo_proof);
    releaseQuestImage(db, chore.image);
    res.json({ message: 'Chore deleted' });
  } catch (err) {
    console.error('Error deleting chore:', err);
    res.status(500).json({ error: 'Failed to delete chore' });
  }
});

// POST /:id/checklist — add item (parent only)
router.post('/:id/checklist', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT id FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const itemId = uuidv4();
    db.prepare('INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)').run(itemId, req.params.id, text);
    const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(itemId);
    res.status(201).json(item);
  } catch (err) {
    console.error('Error adding checklist item:', err);
    res.status(500).json({ error: 'Failed to add checklist item' });
  }
});

// PATCH /:id/checklist/:itemId — toggle (any family member)
router.patch('/:id/checklist/:itemId', requireActiveMember, (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT id FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });
    const item = db.prepare('SELECT * FROM checklist_items WHERE id = ? AND chore_id = ?')
      .get(req.params.itemId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });
    const newCompleted = item.completed ? 0 : 1;
    db.prepare('UPDATE checklist_items SET completed = ? WHERE id = ?').run(newCompleted, req.params.itemId);
    res.json(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(req.params.itemId));
  } catch (err) {
    console.error('Error toggling checklist item:', err);
    res.status(500).json({ error: 'Failed to toggle checklist item' });
  }
});

// POST /:id/photo — upload proof (any family member)
function requireChoreForPhoto(req, res, next) {
  const chore = getDb().prepare('SELECT id, photo_proof FROM chores WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  req.chore = chore;
  next();
}

router.post('/:id/photo', requireActiveMember, requireChoreForPhoto, imageUpload('photo', 'photo'), (req, res) => {
  try {
    const db = getDb();
    const filename = req.upload.filename;
    db.prepare('UPDATE chores SET photo_proof = ? WHERE id = ?').run(filename, req.chore.id);
    deleteUpload('photo', req.chore.photo_proof);
    res.json({ photoUrl: '/photos/' + filename });
  } catch (err) {
    console.error('Error uploading photo:', err);
    deleteUpload('photo', req.upload?.filename);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// POST /:id/approve — parent only; approving member derived from active member
router.post('/:id/approve', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });

    db.transaction(() => {
      db.prepare('UPDATE chores SET points_approved = 1, approved_by = ? WHERE id = ?')
        .run(req.currentMember.id, req.params.id);
      const assignments = db.prepare('SELECT member_id FROM chore_assignments WHERE chore_id = ?')
        .all(req.params.id);
      db.prepare("DELETE FROM points_ledger WHERE chore_id = ? AND type = 'escrow'").run(req.params.id);
      const insertLedger = db.prepare(
        `INSERT INTO points_ledger (id, family_id, member_id, amount, type, chore_id, description, approved_by)
         VALUES (?, ?, ?, ?, 'released', ?, ?, ?)`
      );
      for (const a of assignments) {
        insertLedger.run(uuidv4(), req.familyId, a.member_id, chore.points, req.params.id, `Released: ${chore.title}`, req.currentMember.id);
      }
    })();

    res.json(getChoreWithRelations(db, req.params.id, req.familyId));
  } catch (err) {
    console.error('Error approving chore:', err);
    res.status(500).json({ error: 'Failed to approve chore' });
  }
});

// POST /:id/duplicate — parent only
router.post('/:id/duplicate', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const src = db.prepare('SELECT * FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!src) return res.status(404).json({ error: 'Chore not found' });

    const { dueDate } = req.body || {};
    const newId = uuidv4();

    const insertChore = db.prepare(
      `INSERT INTO chores (id, family_id, title, description, points, status, created_by, due_date, category)
       VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?)`
    );
    const insertAssign = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)');
    const insertStep = db.prepare('INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)');

    db.transaction(() => {
      insertChore.run(
        newId, req.familyId, src.title, src.description || '', src.points,
        req.currentMember.id, dueDate ?? src.due_date, src.category || 'Chore'
      );
      const assigns = db.prepare('SELECT member_id FROM chore_assignments WHERE chore_id = ?').all(src.id);
      for (const a of assigns) insertAssign.run(newId, a.member_id);
      const steps = db.prepare('SELECT text FROM checklist_items WHERE chore_id = ? ORDER BY rowid ASC').all(src.id);
      for (const s of steps) if (s.text) insertStep.run(uuidv4(), newId, s.text);
    })();

    res.status(201).json(getChoreWithRelations(db, newId, req.familyId));
  } catch (err) {
    console.error('Error duplicating chore:', err);
    res.status(500).json({ error: 'Failed to duplicate chore' });
  }
});

// POST /:id/reject — parent only
router.post('/:id/reject', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT id FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });
    db.prepare('UPDATE chores SET photo_proof = NULL WHERE id = ?').run(req.params.id);
    res.json(getChoreWithRelations(db, req.params.id, req.familyId));
  } catch (err) {
    console.error('Error rejecting photo:', err);
    res.status(500).json({ error: 'Failed to reject photo' });
  }
});

export default router;
