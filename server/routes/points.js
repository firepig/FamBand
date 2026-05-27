import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

const router = Router();

// GET /:memberId — get point balance, ledger history, and achievements
router.get('/:memberId', (req, res) => {
  try {
    const db = getDb();
    const { memberId } = req.params;

    const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Balance: (earned + released) - spent
    const earnedResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned', 'released')"
    ).get(memberId);

    const spentResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(memberId);

    const escrowResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'escrow'"
    ).get(memberId);

    const balance = earnedResult.total - spentResult.total;

    // Full ledger history
    const ledger = db.prepare(
      'SELECT * FROM points_ledger WHERE member_id = ? ORDER BY created_at DESC'
    ).all(memberId);

    // Achievements earned
    const achievements = db.prepare(
      `SELECT ma.*, a.name, a.icon, a.description, a.criteria
       FROM member_achievements ma
       JOIN achievements a ON a.id = ma.achievement_id
       WHERE ma.member_id = ?`
    ).all(memberId);

    res.json({
      balance,
      escrow: escrowResult.total,
      ledger,
      achievements,
    });
  } catch (err) {
    console.error('Error fetching points:', err);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

// POST /escrow — add escrow points
router.post('/escrow', (req, res) => {
  try {
    const { memberId, amount, choreId, description } = req.body;
    const db = getDb();

    if (!memberId || amount === undefined) {
      return res.status(400).json({ error: 'memberId and amount are required' });
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO points_ledger (id, member_id, amount, type, chore_id, description)
       VALUES (?, ?, ?, 'escrow', ?, ?)`
    ).run(id, memberId, amount, choreId || null, description || null);

    const entry = db.prepare('SELECT * FROM points_ledger WHERE id = ?').get(id);
    res.status(201).json(entry);
  } catch (err) {
    console.error('Error adding escrow:', err);
    res.status(500).json({ error: 'Failed to add escrow points' });
  }
});

// POST /redeem — spend points on a snack
router.post('/redeem', (req, res) => {
  try {
    const { memberId, snackId } = req.body;
    const db = getDb();

    if (!memberId || !snackId) {
      return res.status(400).json({ error: 'memberId and snackId are required' });
    }

    // Check snack exists and is available
    const snack = db.prepare('SELECT * FROM snack_shop WHERE id = ? AND available = 1').get(snackId);
    if (!snack) {
      return res.status(404).json({ error: 'Snack not found or not available' });
    }

    // Check member balance
    const earnedResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned', 'released')"
    ).get(memberId);

    const spentResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(memberId);

    const balance = earnedResult.total - spentResult.total;

    if (balance < snack.cost) {
      return res.status(400).json({
        error: 'Not enough points',
        balance,
        required: snack.cost,
      });
    }

    // Perform the transaction
    const transaction = db.transaction(() => {
      // Deduct points
      db.prepare(
        `INSERT INTO points_ledger (id, member_id, amount, type, description)
         VALUES (?, ?, ?, 'spent', ?)`
      ).run(uuidv4(), memberId, snack.cost, snack.name);

      // Record redemption
      db.prepare(
        'INSERT INTO member_snacks (id, member_id, snack_id) VALUES (?, ?, ?)'
      ).run(uuidv4(), memberId, snackId);
    });

    transaction();

    // Calculate new balance
    const newEarnedResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned', 'released')"
    ).get(memberId);

    const newSpentResult = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(memberId);

    const newBalance = newEarnedResult.total - newSpentResult.total;

    res.json({ success: true, balance: newBalance });
  } catch (err) {
    console.error('Error redeeming points:', err);
    res.status(500).json({ error: 'Failed to redeem points' });
  }
});

// POST /release — release escrow points
router.post('/release', (req, res) => {
  try {
    const { memberId, choreId, approvedBy } = req.body;
    const db = getDb();

    if (!memberId || !choreId) {
      return res.status(400).json({ error: 'memberId and choreId are required' });
    }

    // Find the escrow entry
    const escrow = db.prepare(
      "SELECT * FROM points_ledger WHERE member_id = ? AND chore_id = ? AND type = 'escrow'"
    ).get(memberId, choreId);

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow entry not found' });
    }

    const transaction = db.transaction(() => {
      // Delete the escrow entry
      db.prepare("DELETE FROM points_ledger WHERE id = ?").run(escrow.id);

      // Insert released entry
      const id = uuidv4();
      db.prepare(
        `INSERT INTO points_ledger (id, member_id, amount, type, chore_id, description, approved_by)
         VALUES (?, ?, ?, 'released', ?, ?, ?)`
      ).run(id, memberId, escrow.amount, choreId, escrow.description, approvedBy || null);
    });

    transaction();

    res.json({ success: true, message: 'Points released' });
  } catch (err) {
    console.error('Error releasing points:', err);
    res.status(500).json({ error: 'Failed to release points' });
  }
});

export default router;
