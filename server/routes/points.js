import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';
import { POINTS_PER_BLOCK, CENTS_PER_BLOCK, MAX_BLOCKS } from '../lib/cash.js';

const router = Router();

function memberInFamily(db, memberId, familyId) {
  return !!db.prepare('SELECT 1 FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId);
}

function balanceOf(db, memberId) {
  const earned = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned','released')"
  ).get(memberId);
  const spent = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
  ).get(memberId);
  return earned.total - spent.total;
}

// GET /cash-outs — parents see everyone's, kids see their own. Must stay above /:memberId.
router.get('/cash-outs', requireActiveMember, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT c.*, m.name AS member_name, m.avatar AS member_avatar
         FROM cash_outs c LEFT JOIN family_members m ON m.id = c.member_id
        WHERE c.family_id = ? ${req.currentMember.role === 'parent' ? '' : 'AND c.member_id = ?'}
        ORDER BY (c.status = 'owed') DESC, c.created_at DESC LIMIT 200`
    ).all(...(req.currentMember.role === 'parent' ? [req.familyId] : [req.familyId, req.currentMember.id]));
    res.json({ rate: { points: POINTS_PER_BLOCK, cents: CENTS_PER_BLOCK }, cashOuts: rows });
  } catch (err) {
    console.error('Error listing cash-outs:', err);
    res.status(500).json({ error: 'Failed to load cash-outs' });
  }
});

// POST /cash-out — the active member converts whole blocks of points to cash they are owed.
router.post('/cash-out', requireActiveMember, (req, res) => {
  try {
    const blocks = Number(req.body?.blocks);
    if (!Number.isInteger(blocks) || blocks < 1 || blocks > MAX_BLOCKS) {
      return res.status(400).json({ error: `Choose between 1 and ${MAX_BLOCKS} cash-out blocks` });
    }
    const db = getDb();
    const memberId = req.currentMember.id;
    const points = blocks * POINTS_PER_BLOCK;
    const cents = blocks * CENTS_PER_BLOCK;
    let balance;
    const id = uuidv4();
    db.transaction(() => {
      balance = balanceOf(db, memberId);
      if (balance < points) {
        const err = new Error('Not enough points');
        err.insufficient = true;
        throw err;
      }
      db.prepare(
        `INSERT INTO points_ledger (id, family_id, member_id, amount, type, description)
         VALUES (?, ?, ?, ?, 'spent', ?)`
      ).run(uuidv4(), req.familyId, memberId, points, `Cash out $${(cents / 100).toFixed(2)}`);
      db.prepare(
        'INSERT INTO cash_outs (id, family_id, member_id, points, cents) VALUES (?, ?, ?, ?, ?)'
      ).run(id, req.familyId, memberId, points, cents);
    })();
    res.status(201).json({ success: true, id, points, cents, balance: balance - points });
  } catch (err) {
    if (err.insufficient) {
      return res.status(400).json({ error: 'Not enough points' });
    }
    console.error('Error cashing out:', err);
    res.status(500).json({ error: 'Failed to cash out' });
  }
});

// POST /cash-outs/:id/paid — parent confirms the cash was handed over
router.post('/cash-outs/:id/paid', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(
      `UPDATE cash_outs SET status = 'paid', paid_at = datetime('now'), paid_by = ?
        WHERE id = ? AND family_id = ? AND status = 'owed'`
    ).run(req.currentMember.id, req.params.id, req.familyId);
    if (!result.changes) return res.status(404).json({ error: 'No unpaid cash-out found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking cash-out paid:', err);
    res.status(500).json({ error: 'Failed to update cash-out' });
  }
});

// GET /transfers — gifts between members. Parents see the whole family's; everyone else only their own.
router.get('/transfers', requireActiveMember, (req, res) => {
  try {
    const db = getDb();
    const me = req.currentMember;
    const mine = me.role === 'parent' ? '' : 'AND (t.from_member_id = ? OR t.to_member_id = ?)';
    const args = me.role === 'parent' ? [req.familyId] : [req.familyId, me.id, me.id];
    const rows = db.prepare(
      `SELECT t.*, f.name AS from_name, f.avatar AS from_avatar, r.name AS to_name, r.avatar AS to_avatar
         FROM point_transfers t
         LEFT JOIN family_members f ON f.id = t.from_member_id
         LEFT JOIN family_members r ON r.id = t.to_member_id
        WHERE t.family_id = ? ${mine}
        ORDER BY t.created_at DESC, t.rowid DESC LIMIT 100`
    ).all(...args);
    res.json(rows);
  } catch (err) {
    console.error('Error listing transfers:', err);
    res.status(500).json({ error: 'Failed to load gifts' });
  }
});

// POST /transfer — the active member gifts some of their own balance to another member. Instant.
router.post('/transfer', requireActiveMember, (req, res) => {
  try {
    const { toMemberId } = req.body || {};
    const amount = Number(req.body?.amount);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 100) : '';
    if (!toMemberId) return res.status(400).json({ error: 'Choose who to send points to' });
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      return res.status(400).json({ error: 'Enter a whole number of points (1 or more)' });
    }
    const db = getDb();
    const from = req.currentMember;
    if (toMemberId === from.id) return res.status(400).json({ error: "You can't send points to yourself" });
    const to = db.prepare('SELECT id, name FROM family_members WHERE id = ? AND family_id = ?').get(toMemberId, req.familyId);
    if (!to) return res.status(404).json({ error: 'Member not found' });

    let balance;
    const id = uuidv4();
    db.transaction(() => {
      balance = balanceOf(db, from.id);
      if (balance < amount) {
        const err = new Error('Not enough points');
        err.insufficient = true;
        throw err;
      }
      // Recorded as 'earned' for the receiver (not 'released') so family "points released" stats
      // only count quest rewards.
      db.prepare(
        `INSERT INTO points_ledger (id, family_id, member_id, amount, type, description)
         VALUES (?, ?, ?, ?, 'spent', ?)`
      ).run(uuidv4(), req.familyId, from.id, amount, `Gift to ${to.name}`);
      db.prepare(
        `INSERT INTO points_ledger (id, family_id, member_id, amount, type, description)
         VALUES (?, ?, ?, ?, 'earned', ?)`
      ).run(uuidv4(), req.familyId, to.id, amount, `Gift from ${from.name}`);
      db.prepare(
        'INSERT INTO point_transfers (id, family_id, from_member_id, to_member_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, req.familyId, from.id, to.id, amount, note || null);
    })();
    res.status(201).json({ success: true, id, amount, balance: balance - amount });
  } catch (err) {
    if (err.insufficient) return res.status(400).json({ error: 'Not enough points' });
    console.error('Error transferring points:', err);
    res.status(500).json({ error: 'Failed to send points' });
  }
});

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
