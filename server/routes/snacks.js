import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

const router = Router();

// GET / — list all snack shop items
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const snacks = db.prepare('SELECT * FROM snack_shop ORDER BY name ASC').all();
    res.json(snacks);
  } catch (err) {
    console.error('Error fetching snacks:', err);
    res.status(500).json({ error: 'Failed to fetch snacks' });
  }
});

// POST / — add snack item
router.post('/', (req, res) => {
  try {
    const { name, description, cost, image } = req.body;
    const db = getDb();

    if (!name || cost === undefined) {
      return res.status(400).json({ error: 'name and cost are required' });
    }

    const id = uuidv4();
    db.prepare(
      'INSERT INTO snack_shop (id, name, description, cost, image) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, description || '', cost, image || '🍬');

    const snack = db.prepare('SELECT * FROM snack_shop WHERE id = ?').get(id);
    res.status(201).json(snack);
  } catch (err) {
    console.error('Error adding snack:', err);
    res.status(500).json({ error: 'Failed to add snack' });
  }
});

// PATCH /:id — update snack (toggle available, change fields)
router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const snack = db.prepare('SELECT * FROM snack_shop WHERE id = ?').get(req.params.id);

    if (!snack) {
      return res.status(404).json({ error: 'Snack not found' });
    }

    const { name, description, cost, image, available } = req.body;
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (cost !== undefined) { updateFields.push('cost = ?'); updateValues.push(cost); }
    if (image !== undefined) { updateFields.push('image = ?'); updateValues.push(image); }
    if (available !== undefined) { updateFields.push('available = ?'); updateValues.push(available ? 1 : 0); }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(req.params.id);
    db.prepare(
      `UPDATE snack_shop SET ${updateFields.join(', ')} WHERE id = ?`
    ).run(...updateValues);

    const updated = db.prepare('SELECT * FROM snack_shop WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating snack:', err);
    res.status(500).json({ error: 'Failed to update snack' });
  }
});

// GET /history/:memberId — get member's snack redemption history
router.get('/history/:memberId', (req, res) => {
  try {
    const db = getDb();
    const { memberId } = req.params;

    const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const history = db.prepare(
      `SELECT ms.*, ss.name as snack_name, ss.image as snack_image, ss.cost as snack_cost
       FROM member_snacks ms
       JOIN snack_shop ss ON ms.snack_id = ss.id
       WHERE ms.member_id = ?
       ORDER BY ms.redeemed_at DESC`
    ).all(memberId);

    res.json(history);
  } catch (err) {
    console.error('Error fetching snack history:', err);
    res.status(500).json({ error: 'Failed to fetch snack history' });
  }
});

export default router;
