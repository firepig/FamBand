import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const familyId = req.familyId;

    const choresByStatus = db.prepare(
      'SELECT status, COUNT(*) as count FROM chores WHERE family_id = ? GROUP BY status'
    ).all(familyId);

    const choresByMember = db.prepare(
      `SELECT m.name, m.avatar, m.color, COUNT(*) as count
       FROM family_members m
       JOIN chore_assignments ca ON m.id = ca.member_id
       JOIN chores c ON c.id = ca.chore_id
       WHERE c.status = 'done' AND c.family_id = ?
       GROUP BY m.id`
    ).all(familyId);

    const pointsByMember = db.prepare(
      `SELECT m.id, m.name, m.avatar, m.color,
              COALESCE(SUM(CASE WHEN pl.type IN ('earned','released') THEN pl.amount ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN pl.type = 'spent' THEN pl.amount ELSE 0 END), 0) as balance
       FROM family_members m
       LEFT JOIN points_ledger pl ON m.id = pl.member_id
       WHERE m.family_id = ?
       GROUP BY m.id
       ORDER BY balance DESC`
    ).all(familyId);

    const recentActivity = db.prepare(
      `SELECT pl.*, COALESCE(fm.name, 'Former member') as member_name, COALESCE(fm.avatar, '👤') as member_avatar
       FROM points_ledger pl
       LEFT JOIN family_members fm ON pl.member_id = fm.id
       WHERE pl.family_id = ?
       ORDER BY pl.created_at DESC
       LIMIT 20`
    ).all(familyId);

    const memberAchievements = db.prepare(
      `SELECT ma.*, a.name, a.icon, a.description
       FROM member_achievements ma
       JOIN achievements a ON a.id = ma.achievement_id
       WHERE ma.family_id = ?
       ORDER BY ma.earned_at DESC`
    ).all(familyId);

    const topEarner = pointsByMember[0] || null;

    const escrowTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE family_id = ? AND type = 'escrow'"
    ).get(familyId);
    const releasedTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE family_id = ? AND type = 'released'"
    ).get(familyId);
    const totalRedeemed = db.prepare(
      'SELECT COUNT(*) as count FROM member_snacks WHERE family_id = ?'
    ).get(familyId);
    const activeChores = db.prepare(
      "SELECT COUNT(*) as count FROM chores WHERE family_id = ? AND status IN ('todo','in_progress')"
    ).get(familyId);

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
