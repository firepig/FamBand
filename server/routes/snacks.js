import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const snacks = db.prepare('SELECT * FROM snack_shop WHERE family_id = ? ORDER BY name ASC').all(req.familyId);
    res.json(snacks);
  } catch (err) {
    console.error('Error fetching snacks:', err);
    res.status(500).json({ error: 'Failed to fetch snacks' });
  }
});

router.post('/', requireActiveMember, requireParent, (req, res) => {
  try {
    const { name, description, cost, image } = req.body;
    if (!name || cost === undefined) return res.status(400).json({ error: 'name and cost are required' });
    const db = getDb();
    const id = uuidv4();
    db.prepare(
      'INSERT INTO snack_shop (id, family_id, name, description, cost, image) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.familyId, name, description || '', cost, image || '🍬');
    res.status(201).json(db.prepare('SELECT * FROM snack_shop WHERE id = ?').get(id));
  } catch (err) {
    console.error('Error adding snack:', err);
    res.status(500).json({ error: 'Failed to add snack' });
  }
});

router.patch('/:id', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const snack = db.prepare('SELECT * FROM snack_shop WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!snack) return res.status(404).json({ error: 'Snack not found' });

    const { name, description, cost, image, available } = req.body;
    const updateFields = [];
    const updateValues = [];
    if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (cost !== undefined) { updateFields.push('cost = ?'); updateValues.push(cost); }
    if (image !== undefined) { updateFields.push('image = ?'); updateValues.push(image); }
    if (available !== undefined) { updateFields.push('available = ?'); updateValues.push(available ? 1 : 0); }
    if (updateFields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updateValues.push(req.params.id);
    db.prepare(`UPDATE snack_shop SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);
    res.json(db.prepare('SELECT * FROM snack_shop WHERE id = ?').get(req.params.id));
  } catch (err) {
    console.error('Error updating snack:', err);
    res.status(500).json({ error: 'Failed to update snack' });
  }
});

router.get('/history/:memberId', (req, res) => {
  try {
    const db = getDb();
    const member = db.prepare('SELECT id FROM family_members WHERE id = ? AND family_id = ?')
      .get(req.params.memberId, req.familyId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const history = db.prepare(
      `SELECT ms.*, ss.name as snack_name, ss.image as snack_image, ss.cost as snack_cost
       FROM member_snacks ms
       JOIN snack_shop ss ON ms.snack_id = ss.id
       WHERE ms.member_id = ? AND ms.family_id = ?
       ORDER BY ms.redeemed_at DESC`
    ).all(req.params.memberId, req.familyId);
    res.json(history);
  } catch (err) {
    console.error('Error fetching snack history:', err);
    res.status(500).json({ error: 'Failed to fetch snack history' });
  }
});

export default router;
