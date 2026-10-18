import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';

const router = Router();

function memberInFamily(db, memberId, familyId) {
  return !!db.prepare('SELECT 1 FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId);
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const items = req.query.memberId
      ? db.prepare(
          `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
           FROM homework_items hi
           JOIN family_members fm ON hi.member_id = fm.id
           WHERE hi.family_id = ? AND hi.member_id = ?
           ORDER BY hi.due_date ASC, hi.completed ASC`
        ).all(req.familyId, req.query.memberId)
      : db.prepare(
          `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
           FROM homework_items hi
           JOIN family_members fm ON hi.member_id = fm.id
           WHERE hi.family_id = ?
           ORDER BY hi.due_date ASC, hi.completed ASC`
        ).all(req.familyId);
    res.json(items);
  } catch (err) {
    console.error('Error fetching homework:', err);
    res.status(500).json({ error: 'Failed to fetch homework items' });
  }
});

router.post('/', requireActiveMember, requireParent, (req, res) => {
  try {
    const { memberId, subject, description, dueDate } = req.body;
    if (!memberId || !subject) return res.status(400).json({ error: 'memberId and subject are required' });
    const db = getDb();
    if (!memberInFamily(db, memberId, req.familyId)) return res.status(404).json({ error: 'Member not found' });
    const id = uuidv4();
    db.prepare(
      'INSERT INTO homework_items (id, family_id, member_id, subject, description, due_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.familyId, memberId, subject, description || '', dueDate || null);
    const item = db.prepare(
      `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
       FROM homework_items hi
       JOIN family_members fm ON hi.member_id = fm.id
       WHERE hi.id = ?`
    ).get(id);
    res.status(201).json(item);
  } catch (err) {
    console.error('Error creating homework:', err);
    res.status(500).json({ error: 'Failed to create homework item' });
  }
});

// PATCH /:id — kid can toggle completed on their own item; parent can edit anything
router.patch('/:id', requireActiveMember, (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM homework_items WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!item) return res.status(404).json({ error: 'Homework item not found' });

    const { subject, description, dueDate, completed } = req.body;
    const isParent = req.currentMember.role === 'parent';
    const isOwnItem = item.member_id === req.currentMember.id;
    const touchesParentOnly = subject !== undefined || description !== undefined || dueDate !== undefined;
    if (touchesParentOnly && !isParent) return res.status(403).json({ error: 'Parent access required' });
    if (completed !== undefined && !isParent && !isOwnItem) return res.status(403).json({ error: 'Not your homework' });

    const updateFields = [];
    const updateValues = [];
    if (subject !== undefined) { updateFields.push('subject = ?'); updateValues.push(subject); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (dueDate !== undefined) { updateFields.push('due_date = ?'); updateValues.push(dueDate); }
    if (completed !== undefined) { updateFields.push('completed = ?'); updateValues.push(completed ? 1 : 0); }
    if (updateFields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updateValues.push(req.params.id);
    db.prepare(`UPDATE homework_items SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);

    const updated = db.prepare(
      `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
       FROM homework_items hi
       JOIN family_members fm ON hi.member_id = fm.id
       WHERE hi.id = ?`
    ).get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating homework:', err);
    res.status(500).json({ error: 'Failed to update homework item' });
  }
});

router.delete('/:id', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT id FROM homework_items WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!item) return res.status(404).json({ error: 'Homework item not found' });
    db.prepare('DELETE FROM homework_items WHERE id = ?').run(req.params.id);
    res.json({ message: 'Homework item deleted' });
  } catch (err) {
    console.error('Error deleting homework:', err);
    res.status(500).json({ error: 'Failed to delete homework item' });
  }
});

export default router;
