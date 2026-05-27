import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

const router = Router();

// GET / — list homework items, optional ?memberId= filter
router.get('/', (req, res) => {
  try {
    const db = getDb();
    let items;

    if (req.query.memberId) {
      items = db.prepare(
        `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
         FROM homework_items hi
         JOIN family_members fm ON hi.member_id = fm.id
         WHERE hi.member_id = ?
         ORDER BY hi.due_date ASC, hi.completed ASC`
      ).all(req.query.memberId);
    } else {
      items = db.prepare(
        `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
         FROM homework_items hi
         JOIN family_members fm ON hi.member_id = fm.id
         ORDER BY hi.due_date ASC, hi.completed ASC`
      ).all();
    }

    res.json(items);
  } catch (err) {
    console.error('Error fetching homework items:', err);
    res.status(500).json({ error: 'Failed to fetch homework items' });
  }
});

// POST / — create homework item
router.post('/', (req, res) => {
  try {
    const { memberId, subject, description, dueDate } = req.body;
    const db = getDb();

    if (!memberId || !subject) {
      return res.status(400).json({ error: 'memberId and subject are required' });
    }

    const id = uuidv4();
    db.prepare(
      'INSERT INTO homework_items (id, member_id, subject, description, due_date) VALUES (?, ?, ?, ?, ?)'
    ).run(id, memberId, subject, description || '', dueDate || null);

    const item = db.prepare(
      `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
       FROM homework_items hi
       JOIN family_members fm ON hi.member_id = fm.id
       WHERE hi.id = ?`
    ).get(id);

    res.status(201).json(item);
  } catch (err) {
    console.error('Error creating homework item:', err);
    res.status(500).json({ error: 'Failed to create homework item' });
  }
});

// PATCH /:id — update homework item
router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM homework_items WHERE id = ?').get(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Homework item not found' });
    }

    const { subject, description, dueDate, completed } = req.body;
    const updateFields = [];
    const updateValues = [];

    if (subject !== undefined) { updateFields.push('subject = ?'); updateValues.push(subject); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (dueDate !== undefined) { updateFields.push('due_date = ?'); updateValues.push(dueDate); }
    if (completed !== undefined) { updateFields.push('completed = ?'); updateValues.push(completed ? 1 : 0); }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(req.params.id);
    db.prepare(
      `UPDATE homework_items SET ${updateFields.join(', ')} WHERE id = ?`
    ).run(...updateValues);

    const updated = db.prepare(
      `SELECT hi.*, fm.name as member_name, fm.avatar as member_avatar
       FROM homework_items hi
       JOIN family_members fm ON hi.member_id = fm.id
       WHERE hi.id = ?`
    ).get(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error('Error updating homework item:', err);
    res.status(500).json({ error: 'Failed to update homework item' });
  }
});

// DELETE /:id — delete homework item
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM homework_items WHERE id = ?').get(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Homework item not found' });
    }

    db.prepare('DELETE FROM homework_items WHERE id = ?').run(req.params.id);
    res.json({ message: 'Homework item deleted successfully' });
  } catch (err) {
    console.error('Error deleting homework item:', err);
    res.status(500).json({ error: 'Failed to delete homework item' });
  }
});

export default router;
