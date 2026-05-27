import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

const router = Router();

// GET / — list all members
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const members = db.prepare('SELECT * FROM family_members ORDER BY name ASC').all();
    res.json(members);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST / — add member
router.post('/', (req, res) => {
  try {
    const { name, role, avatar, color } = req.body;

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required' });
    }

    if (!['parent', 'child'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "parent" or "child"' });
    }

    const db = getDb();
    const id = uuidv4();
    const insert = db.prepare(
      'INSERT INTO family_members (id, name, role, avatar, color) VALUES (?, ?, ?, ?, ?)'
    );
    insert.run(id, name, role, avatar || '👤', color || '#6c757d');

    const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(id);
    res.status(201).json(member);
  } catch (err) {
    console.error('Error creating member:', err);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// GET /:id — get member details with point balance
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.id);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Point balance: (earned + released) - spent
    const earnedResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned', 'released')"
    ).get(req.params.id);

    const spentResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(req.params.id);

    const balance = earnedResult.total - spentResult.total;

    res.json({
      ...member,
      balance,
    });
  } catch (err) {
    console.error('Error fetching member:', err);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

export default router;
