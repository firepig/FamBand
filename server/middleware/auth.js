import { getDb } from '../db.js';

export default function authMiddleware(req, res, next) {
  try {
    const memberId = req.headers['x-family-member'];
    if (!memberId) {
      req.currentMember = null;
      return next();
    }

    const db = getDb();
    const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(memberId);

    if (!member) {
      req.currentMember = null;
      return next();
    }

    req.currentMember = member;
    next();
  } catch (err) {
    req.currentMember = null;
    next();
  }
}
