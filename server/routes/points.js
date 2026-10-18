import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';

const router = Router();

function memberInFamily(db, memberId, familyId) {
  return !!db.prepare('SELECT 1 FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId);
}

// GET /:memberId — balance, ledger, achievements
router.get('/:memberId', (req, res) => {
  try {
    const db = getDb();
    const { memberId } = req.params;
    if (!memberInFamily(db, memberId, req.familyId)) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const earned = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned','released')"
    ).get(memberId);
    const spent = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(memberId);
    const escrow = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'escrow'"
    ).get(memberId);

    const ledger = db.prepare(
      'SELECT * FROM points_ledger WHERE member_id = ? ORDER BY created_at DESC'
    ).all(memberId);

    const achievements = db.prepare(
      `SELECT ma.*, a.name, a.icon, a.description, a.criteria
       FROM member_achievements ma
       JOIN achievements a ON a.id = ma.achievement_id
       WHERE ma.member_id = ?`
    ).all(memberId);

    res.json({ balance: earned.total - spent.total, escrow: escrow.total, ledger, achievements });
  } catch (err) {
    console.error('Error fetching points:', err);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

// POST /escrow — parent only
router.post('/escrow', requireActiveMember, requireParent, (req, res) => {
  try {
    const { memberId, amount, choreId, description } = req.body;
    if (!memberId || amount === undefined) return res.status(400).json({ error: 'memberId and amount are required' });
    const db = getDb();
    if (!memberInFamily(db, memberId, req.familyId)) return res.status(404).json({ error: 'Member not found' });
    const id = uuidv4();
    db.prepare(
      `INSERT INTO points_ledger (id, family_id, member_id, amount, type, chore_id, description)
       VALUES (?, ?, ?, ?, 'escrow', ?, ?)`
    ).run(id, req.familyId, memberId, amount, choreId || null, description || null);
    res.status(201).json(db.prepare('SELECT * FROM points_ledger WHERE id = ?').get(id));
  } catch (err) {
    console.error('Error adding escrow:', err);
    res.status(500).json({ error: 'Failed to add escrow points' });
  }
});

// POST /redeem — any member can redeem for themselves. Member spending is derived from active member.
router.post('/redeem', requireActiveMember, (req, res) => {
  try {
    const { snackId } = req.body;
    if (!snackId) return res.status(400).json({ error: 'snackId is required' });
    const db = getDb();
    const memberId = req.currentMember.id;

    const snack = db.prepare('SELECT * FROM snack_shop WHERE id = ? AND family_id = ? AND available = 1')
      .get(snackId, req.familyId);
    if (!snack) return res.status(404).json({ error: 'Snack not found or not available' });

    const earned = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned','released')"
    ).get(memberId);
    const spent = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(memberId);
    const balance = earned.total - spent.total;
    if (balance < snack.cost) {
      return res.status(400).json({ error: 'Not enough points', balance, required: snack.cost });
    }

    db.transaction(() => {
      db.prepare(
        `INSERT INTO points_ledger (id, family_id, member_id, amount, type, description)
         VALUES (?, ?, ?, ?, 'spent', ?)`
      ).run(uuidv4(), req.familyId, memberId, snack.cost, snack.name);
      db.prepare(
        'INSERT INTO member_snacks (id, family_id, member_id, snack_id) VALUES (?, ?, ?, ?)'
      ).run(uuidv4(), req.familyId, memberId, snackId);
    })();

    const newEarned = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned','released')"
    ).get(memberId);
    const newSpent = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(memberId);
    res.json({ success: true, balance: newEarned.total - newSpent.total });
  } catch (err) {
    console.error('Error redeeming points:', err);
    res.status(500).json({ error: 'Failed to redeem points' });
  }
});

// POST /release — parent only
router.post('/release', requireActiveMember, requireParent, (req, res) => {
  try {
    const { memberId, choreId } = req.body;
    if (!memberId || !choreId) return res.status(400).json({ error: 'memberId and choreId are required' });
    const db = getDb();
    if (!memberInFamily(db, memberId, req.familyId)) return res.status(404).json({ error: 'Member not found' });

    const escrow = db.prepare(
      "SELECT * FROM points_ledger WHERE member_id = ? AND chore_id = ? AND type = 'escrow' AND family_id = ?"
    ).get(memberId, choreId, req.familyId);
    if (!escrow) return res.status(404).json({ error: 'Escrow entry not found' });

    db.transaction(() => {
      db.prepare('DELETE FROM points_ledger WHERE id = ?').run(escrow.id);
      db.prepare(
        `INSERT INTO points_ledger (id, family_id, member_id, amount, type, chore_id, description, approved_by)
         VALUES (?, ?, ?, ?, 'released', ?, ?, ?)`
      ).run(uuidv4(), req.familyId, memberId, escrow.amount, choreId, escrow.description, req.currentMember.id);
    })();

    res.json({ success: true, message: 'Points released' });
  } catch (err) {
    console.error('Error releasing points:', err);
    res.status(500).json({ error: 'Failed to release points' });
  }
});

export default router;
