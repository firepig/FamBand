import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// GET / — comprehensive dashboard stats
router.get('/', (req, res) => {
  try {
    const db = getDb();

    // 1. Chores by status
    const choresByStatus = db.prepare(
      'SELECT status, COUNT(*) as count FROM chores GROUP BY status'
    ).all();

    // 2. Chores by member (done chores)
    const choresByMember = db.prepare(
      `SELECT m.name, m.avatar, m.color, COUNT(*) as count
       FROM family_members m
       JOIN chore_assignments ca ON m.id = ca.member_id
       JOIN chores c ON c.id = ca.chore_id
       WHERE c.status = 'done'
       GROUP BY m.id`
    ).all();

    // 3. Points by member
    const pointsByMember = db.prepare(
      `SELECT m.id, m.name, m.avatar, m.color,
              COALESCE(SUM(CASE WHEN pl.type IN ('earned','released') THEN pl.amount ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN pl.type = 'spent' THEN pl.amount ELSE 0 END), 0) as balance
       FROM family_members m
       LEFT JOIN points_ledger pl ON m.id = pl.member_id
       GROUP BY m.id
       ORDER BY balance DESC`
    ).all();

    // 4. Recent activity (last 20 ledger entries with member names)
    const recentActivity = db.prepare(
      `SELECT pl.*, fm.name as member_name, fm.avatar as member_avatar
       FROM points_ledger pl
       JOIN family_members fm ON pl.member_id = fm.id
       ORDER BY pl.created_at DESC
       LIMIT 20`
    ).all();

    // 5. Member achievements
    const memberAchievements = db.prepare(
      `SELECT ma.*, a.name, a.icon, a.description
       FROM member_achievements ma
       JOIN achievements a ON a.id = ma.achievement_id
       ORDER BY ma.earned_at DESC`
    ).all();

    // 6. Top earner (member with highest balance)
    let topEarner = null;
    if (pointsByMember.length > 0) {
      topEarner = pointsByMember[0];
    }

    // 7. Total points in escrow
    const escrowTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE type = 'escrow'"
    ).get();

    // 8. Total points released
    const releasedTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE type = 'released'"
    ).get();

    // 9. Total snacks redeemed
    const totalRedeemed = db.prepare(
      'SELECT COUNT(*) as count FROM member_snacks'
    ).get();

    // 10. Active chores count (todo + in_progress)
    const activeChores = db.prepare(
      "SELECT COUNT(*) as count FROM chores WHERE status IN ('todo', 'in_progress')"
    ).get();

    res.json({
      choresByStatus,
      choresByMember,
      pointsByMember,
      recentActivity,
      memberAchievements,
      topEarner,
      escrowTotal: escrowTotal.total,
      releasedTotal: releasedTotal.total,
      totalRedeemed: totalRedeemed.count,
      activeChores: activeChores.count,
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
