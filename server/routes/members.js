import { Router } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';
import { imageUpload, deleteUpload, avatarFilename, AVATAR_IMG_PREFIX } from '../lib/uploads.js';
import { choreHasProgress } from '../lib/progress.js';
import { onMemberRemoved } from '../lib/rotation.js';

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

const MEMBER_COLS =
  'id, family_id, user_id, name, role, avatar, color, created_at, (pin_hash IS NOT NULL) as has_pin';

// Parents may edit anyone in the family; everyone else only themselves.
function loadEditableMember(req, res, next) {
  const db = getDb();
  const target = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  const isParent = req.currentMember.role === 'parent';
  if (!isParent && req.currentMember.id !== target.id) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  req.targetMember = target;
  next();
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #12ab34').optional(),
  // Emoji only; uploaded images go through POST /:id/avatar.
  avatar: z.string().trim().min(1).max(16)
    .refine((v) => !v.startsWith(AVATAR_IMG_PREFIX), 'Use the upload endpoint for images').optional(),
});

// PATCH /:id — edit profile (name, color, emoji avatar).
// Parents can edit anyone; a member can edit their own color/avatar but not their name.
router.patch('/:id', requireActiveMember, loadEditableMember, (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body || {});
    const isParent = req.currentMember.role === 'parent';
    if (input.name !== undefined && !isParent) {
      return res.status(403).json({ error: 'Only a parent can rename a member' });
    }
    const sets = [];
    const vals = [];
    for (const col of ['name', 'color', 'avatar']) {
      if (input[col] !== undefined) { sets.push(`${col} = ?`); vals.push(input[col]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const db = getDb();
    db.prepare(`UPDATE family_members SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.targetMember.id);
    if (input.avatar !== undefined) deleteUpload('avatar', avatarFilename(req.targetMember.avatar));

    res.json(db.prepare(`SELECT ${MEMBER_COLS} FROM family_members WHERE id = ?`).get(req.targetMember.id));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
    next(err);
  }
});

// POST /:id/avatar — upload an avatar image (multipart field "avatar").
router.post('/:id/avatar', requireActiveMember, loadEditableMember, imageUpload('avatar', 'avatar'), (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('UPDATE family_members SET avatar = ? WHERE id = ?')
      .run(AVATAR_IMG_PREFIX + req.upload.filename, req.targetMember.id);
    deleteUpload('avatar', avatarFilename(req.targetMember.avatar));
    res.json(db.prepare(`SELECT ${MEMBER_COLS} FROM family_members WHERE id = ?`).get(req.targetMember.id));
  } catch (err) {
    deleteUpload('avatar', req.upload?.filename);
    next(err);
  }
});

// Removes a member and everything that points at them, in one transaction:
//  - quests/series are unlinked from them; untouched cards generated just for them are
//    deleted, and a series left with no players is paused
//  - quests and series they created are kept and credited to whoever is removing them
//  - their own content (posts, homework, snacks, achievements, pending points) goes with them
//  - earned/spent points history is kept, unattributed (points_ledger.member_id -> NULL)
function removeMember(db, member, actingMemberId) {
  db.transaction(() => {
    // Rotating series: re-anchor first so the current turn doesn't change when they leave.
    onMemberRemoved(db, member.id);
    const spawned = db.prepare(
      `SELECT * FROM chores WHERE family_id = ? AND instance_member_id = ?
         AND template_id IS NOT NULL AND status = 'todo'`
    ).all(member.family_id, member.id);
    for (const card of spawned) {
      if (!choreHasProgress(db, card)) db.prepare('DELETE FROM chores WHERE id = ?').run(card.id);
    }
    db.prepare('DELETE FROM chore_assignments WHERE member_id = ?').run(member.id);
    db.prepare('DELETE FROM chore_template_assignments WHERE member_id = ?').run(member.id);
    db.prepare(
      `UPDATE chore_templates SET active = 0
         WHERE family_id = ? AND active = 1
           AND NOT EXISTS (SELECT 1 FROM chore_template_assignments a WHERE a.template_id = chore_templates.id)`
    ).run(member.family_id);

    db.prepare('UPDATE chores SET created_by = ? WHERE created_by = ?').run(actingMemberId, member.id);
    db.prepare('UPDATE chore_templates SET created_by = ? WHERE created_by = ?').run(actingMemberId, member.id);

    db.prepare('DELETE FROM bulletin_posts WHERE author_id = ?').run(member.id);
    db.prepare('DELETE FROM homework_items WHERE member_id = ?').run(member.id);
    db.prepare('DELETE FROM member_snacks WHERE member_id = ?').run(member.id);
    db.prepare('DELETE FROM member_achievements WHERE member_id = ?').run(member.id);
    db.prepare("DELETE FROM points_ledger WHERE member_id = ? AND type = 'escrow'").run(member.id);

    db.prepare('DELETE FROM family_members WHERE id = ?').run(member.id);
  })();
}

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
    if (target.id === req.currentMember.id) {
      return res.status(400).json({ error: 'Switch to another player before removing this one' });
    }
    removeMember(db, target, req.currentMember.id);
    deleteUpload('avatar', avatarFilename(target.avatar));
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting member:', err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

export default router;
