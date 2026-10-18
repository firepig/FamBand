import { getDb } from '../db.js';

// Session shape: { userId, familyId, activeMemberId? }
// activeMemberId is only set after /auth/select-member succeeds.

export function requireUser(req, res, next) {
  if (!req.session?.userId || !req.session?.familyId) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  req.familyId = req.session.familyId;
  req.userId = req.session.userId;
  next();
}

export function requireActiveMember(req, res, next) {
  if (!req.session?.activeMemberId) {
    return res.status(403).json({ error: 'No active member — enter PIN' });
  }
  const db = getDb();
  const member = db.prepare(
    'SELECT * FROM family_members WHERE id = ? AND family_id = ?'
  ).get(req.session.activeMemberId, req.session.familyId);
  if (!member) {
    return res.status(403).json({ error: 'Active member not found' });
  }
  req.currentMember = member;
  next();
}

export function requireParent(req, res, next) {
  if (!req.currentMember || req.currentMember.role !== 'parent') {
    return res.status(403).json({ error: 'Parent access required' });
  }
  next();
}
