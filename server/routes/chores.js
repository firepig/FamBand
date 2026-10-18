import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { materializeChores } from '../lib/materialize.js';
import { getOccurrences, normalizeDays, toDateKey } from '../lib/recurrence.js';
import { choreHasProgress } from '../lib/progress.js';
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
    if (image && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });

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

    const { title, description, points, status, dueDate, category, assignedTo, image, checklist } = req.body;
    const isParent = req.currentMember.role === 'parent';
    const touchesParentOnly =
      title !== undefined || description !== undefined || points !== undefined ||
      dueDate !== undefined || category !== undefined || assignedTo !== undefined ||
      image !== undefined || checklist !== undefined;
    if (touchesParentOnly && !isParent) {
      return res.status(403).json({ error: 'Parent access required for these fields' });
    }

    if (image && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });

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
      if (Array.isArray(checklist)) {
        // Replace the step list but keep each existing step's id (and so its
        // completed flag); steps the client dropped are removed.
        const existingIds = db.prepare('SELECT id FROM checklist_items WHERE chore_id = ?')
          .all(req.params.id).map((r) => r.id);
        const kept = new Set();
        const upd = db.prepare('UPDATE checklist_items SET text = ? WHERE id = ? AND chore_id = ?');
        const ins = db.prepare('INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)');
        for (const item of checklist) {
          const text = String(item?.text ?? '').trim();
          if (!text) continue;
          if (item.id && existingIds.includes(item.id) && !kept.has(item.id)) {
            upd.run(text, item.id, req.params.id);
            kept.add(item.id);
          } else {
            ins.run(uuidv4(), req.params.id, text);
          }
        }
        const del = db.prepare('DELETE FROM checklist_items WHERE id = ?');
        for (const oldId of existingIds) if (!kept.has(oldId)) del.run(oldId);
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

// POST /:id/make-repeating — turn a one-off quest into a repeating one (parent only).
// Creates a template from the quest. If today is a scheduled day, the quest itself
// becomes today's occurrence so nothing is duplicated; otherwise it stays a one-off
// and the series starts on the next scheduled day.
const REPEAT_FREQ = new Set(['daily', 'weekdays', 'weekly', 'custom']);

router.post('/:id/make-repeating', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const chore = db.prepare('SELECT * FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });
    if (chore.template_id) return res.status(400).json({ error: 'This quest already repeats' });

    const { frequency, daysOfWeek, interval = 1, startDate = null, endDate = null, perMember = true } = req.body || {};
    if (!REPEAT_FREQ.has(frequency)) return res.status(400).json({ error: 'Invalid frequency' });
    const days = normalizeDays(daysOfWeek);
    if ((frequency === 'weekly' || frequency === 'custom') && !days) {
      return res.status(400).json({ error: 'Pick at least one day of the week' });
    }

    const assigned = db.prepare('SELECT member_id FROM chore_assignments WHERE chore_id = ?')
      .all(chore.id).map((r) => r.member_id);
    const steps = db.prepare('SELECT text FROM checklist_items WHERE chore_id = ? ORDER BY rowid ASC').all(chore.id);

    const started = choreHasProgress(db, chore);

    // One assignee: per-member and shared are the same thing, so use per-member.
    let perMemberFinal = assigned.length > 1 ? !!perMember : true;

    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const todayKey = toDateKey(today);
    const runsToday = getOccurrences(
      { active: 1, frequency, days_of_week: days, interval, start_date: startDate, end_date: endDate },
      today, today
    ).length > 0;

    // A shared card can't stand in for several per-player cards. If it hasn't been
    // started, replace it with per-player cards; if it has, keep it and share the series.
    let removeOriginal = false;
    let perMemberOverridden = false;
    if (runsToday && assigned.length > 1 && perMemberFinal) {
      if (started) { perMemberFinal = false; perMemberOverridden = true; } else { removeOriginal = true; }
    }

    const tplId = uuidv4();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO chore_templates
          (id, family_id, title, description, points, category, created_by, frequency, days_of_week, interval, start_date, end_date, active, per_member, image)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        tplId, req.familyId, chore.title, chore.description || '', chore.points, chore.category || 'Chore',
        req.currentMember.id, frequency, days, interval, startDate, endDate, perMemberFinal ? 1 : 0, chore.image || null
      );
      const insAssign = db.prepare('INSERT INTO chore_template_assignments (template_id, member_id) VALUES (?, ?)');
      assigned.forEach((mid) => insAssign.run(tplId, mid));
      const insStep = db.prepare('INSERT INTO chore_template_checklist (id, template_id, text, order_index) VALUES (?, ?, ?, ?)');
      steps.forEach((st, idx) => { if (st.text) insStep.run(uuidv4(), tplId, st.text, idx); });

      if (runsToday) {
        if (removeOriginal) {
          db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
        } else {
          db.prepare('UPDATE chores SET template_id = ?, occurrence_date = ?, instance_member_id = ? WHERE id = ?')
            .run(tplId, todayKey, perMemberFinal ? (assigned[0] ?? null) : null, chore.id);
        }
      }
    })();

    materializeChores(db, req.familyId);
    res.status(201).json({ templateId: tplId, removedOriginal: removeOriginal, perMemberOverridden, adopted: runsToday && !removeOriginal });
  } catch (err) {
    console.error('Error making chore repeating:', err);
    res.status(500).json({ error: 'Failed to make quest repeating' });
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

    const { dueDate, repeat } = req.body || {};

    // Duplicating a repeating quest can carry the schedule over: clone the whole
    // template (schedule, assignees, steps, picture) as a new repeating quest.
    if (repeat && src.template_id) {
      const tpl = db.prepare('SELECT * FROM chore_templates WHERE id = ? AND family_id = ?')
        .get(src.template_id, req.familyId);
      if (tpl) {
        // A stopped series (frequency 'once' / inactive) never generates quests, so
        // cloning it would "succeed" and produce nothing.
        if (tpl.frequency === 'once' || !tpl.active) {
          return res.status(400).json({ error: 'That repeating quest has ended, so it can\'t be repeated. Use "Just this once" to copy it.' });
        }
        const tplId = uuidv4();
        db.transaction(() => {
          db.prepare(
            `INSERT INTO chore_templates
              (id, family_id, title, description, points, category, created_by, frequency, days_of_week, interval, start_date, end_date, active, per_member, image)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            tplId, req.familyId, tpl.title, tpl.description || '', tpl.points, tpl.category,
            req.currentMember.id, tpl.frequency, tpl.days_of_week || '', tpl.interval, tpl.start_date,
            tpl.end_date, tpl.active, tpl.per_member, tpl.image || null
          );
          db.prepare('INSERT INTO chore_template_assignments (template_id, member_id) SELECT ?, member_id FROM chore_template_assignments WHERE template_id = ?')
            .run(tplId, tpl.id);
          const steps = db.prepare('SELECT text, order_index FROM chore_template_checklist WHERE template_id = ? ORDER BY order_index ASC, rowid ASC').all(tpl.id);
          const insStep = db.prepare('INSERT INTO chore_template_checklist (id, template_id, text, order_index) VALUES (?, ?, ?, ?)');
          steps.forEach((st) => insStep.run(uuidv4(), tplId, st.text, st.order_index));
        })();
        materializeChores(db, req.familyId);
        const first = db.prepare('SELECT id FROM chores WHERE template_id = ? ORDER BY created_at ASC LIMIT 1').get(tplId);
        return res.status(201).json(first
          ? { ...getChoreWithRelations(db, first.id, req.familyId), templateId: tplId }
          : { templateId: tplId });
      }
    }

    const newId = uuidv4();

    const insertChore = db.prepare(
      `INSERT INTO chores (id, family_id, title, description, points, status, created_by, due_date, category, image)
       VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)`
    );
    const insertAssign = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)');
    const insertStep = db.prepare('INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)');

    db.transaction(() => {
      insertChore.run(
        newId, req.familyId, src.title, src.description || '', src.points,
        req.currentMember.id, dueDate ?? src.due_date, src.category || 'Chore', src.image || null
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
    const chore = db.prepare('SELECT id, photo_proof FROM chores WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!chore) return res.status(404).json({ error: 'Chore not found' });
    db.prepare('UPDATE chores SET photo_proof = NULL WHERE id = ?').run(req.params.id);
    deleteUpload('photo', chore.photo_proof);
    res.json(getChoreWithRelations(db, req.params.id, req.familyId));
  } catch (err) {
    console.error('Error rejecting photo:', err);
    res.status(500).json({ error: 'Failed to reject photo' });
  }
});

export default router;
