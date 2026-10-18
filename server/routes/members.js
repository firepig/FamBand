import { Router } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';

const router = Router();

// GET / — list family members
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const members = db.prepare(
      'SELECT id, family_id, user_id, name, role, avatar, color, created_at, (pin_hash IS NOT NULL) as has_pin FROM family_members WHERE family_id = ? ORDER BY name ASC'
    ).all(req.familyId);
    res.json(members);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(['parent', 'child']),
  avatar: z.string().optional(),
  color: z.string().optional(),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

// POST / — add member (parent only)
router.post('/', requireActiveMember, requireParent, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const db = getDb();
    const id = uuidv4();
    const pinHash = await bcrypt.hash(input.pin, 12);
    db.prepare(
      'INSERT INTO family_members (id, family_id, name, role, pin_hash, avatar, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.familyId, input.name, input.role, pinHash, input.avatar || '👤', input.color || '#6c757d');

    const member = db.prepare(
      'SELECT id, family_id, user_id, name, role, avatar, color, created_at, (pin_hash IS NOT NULL) as has_pin FROM family_members WHERE id = ?'
    ).get(id);
    res.status(201).json(member);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0]?.message || 'Invalid input' });
    next(err);
  }
});

// GET /:id — member details with balance
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const member = db.prepare(
      'SELECT id, family_id, user_id, name, role, avatar, color, created_at FROM family_members WHERE id = ? AND family_id = ?'
    ).get(req.params.id, req.familyId);

    if (!member) return res.status(404).json({ error: 'Member not found' });

    const earned = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type IN ('earned','released')"
    ).get(req.params.id);
    const spent = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM points_ledger WHERE member_id = ? AND type = 'spent'"
    ).get(req.params.id);

    res.json({ ...member, balance: earned.total - spent.total });
  } catch (err) {
    console.error('Error fetching member:', err);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

const pinUpdateSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
  currentPin: z.string().regex(/^\d{4,6}$/).optional(),
});

// PATCH /:id/pin — change a member's PIN
// Rules: parent can change any member's PIN in their family;
// non-parent (kid) can only change their own PIN and must supply currentPin.
router.patch('/:id/pin', requireActiveMember, async (req, res, next) => {
  try {
    const { pin, currentPin } = pinUpdateSchema.parse(req.body);
    const db = getDb();
    const target = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!target) return res.status(404).json({ error: 'Member not found' });

    const isParent = req.currentMember.role === 'parent';
    const isSelf = req.currentMember.id === target.id;
    if (!isParent && !isSelf) return res.status(403).json({ error: 'Not allowed' });
    if (!isParent) {
      if (!currentPin || !target.pin_hash || !(await bcrypt.compare(currentPin, target.pin_hash))) {
        return res.status(401).json({ error: 'Current PIN incorrect' });
      }
    }
    const newHash = await bcrypt.hash(pin, 12);
    db.prepare('UPDATE family_members SET pin_hash = ? WHERE id = ?').run(newHash, target.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

// DELETE /:id — remove a member (parent only). Cannot remove the member linked to the current user.
router.delete('/:id', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const target = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.user_id === req.userId) {
      return res.status(400).json({ error: 'Cannot remove the account owner member' });
    }
    db.prepare('DELETE FROM family_members WHERE id = ?').run(target.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting member:', err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

export default router;
