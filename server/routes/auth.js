import { Router } from 'express';
import bcrypt from 'bcrypt';
import { randomUUID, randomBytes } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getDb, seedFamilyDefaults } from '../db.js';
import { requireUser, requireActiveMember } from '../middleware/auth.js';

const router = Router();

const BCRYPT_ROUNDS = 12;
const RECOVERY_CODE_COUNT = 10;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again in 15 minutes' },
});

const pinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many PIN attempts, wait a minute' },
});

function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // 10 chars, grouped as xxxxx-xxxxx for readability
    const raw = randomBytes(8).toString('hex').slice(0, 10).toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

const registerSchema = z.object({
  familyName: z.string().min(1).max(80),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const db = getDb();

    const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const familyId = randomUUID();
    const userId = randomUUID();
    const memberId = randomUUID();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const pinHash = await bcrypt.hash(input.pin, BCRYPT_ROUNDS);
    const recoveryCodes = generateRecoveryCodes();
    const recoveryHashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));

    const tx = db.transaction(() => {
      db.prepare('INSERT INTO families (id, name) VALUES (?, ?)').run(familyId, input.familyName);
      db.prepare(
        'INSERT INTO users (id, family_id, email, password_hash, display_name) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, familyId, input.email.toLowerCase(), passwordHash, input.displayName);
      db.prepare(
        'INSERT INTO family_members (id, family_id, user_id, name, role, pin_hash, avatar, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(memberId, familyId, userId, input.displayName, 'parent', pinHash, '🧑', '#0d6efd');
      const insertCode = db.prepare(
        'INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)'
      );
      for (const hash of recoveryHashes) insertCode.run(randomUUID(), userId, hash);
    });
    tx();

    seedFamilyDefaults(familyId);

    req.session.userId = userId;
    req.session.familyId = familyId;
    req.session.activeMemberId = null;

    // Recovery codes are shown ONCE. Client must save them.
    res.status(201).json({
      user: { id: userId, email: input.email.toLowerCase(), displayName: input.displayName },
      family: { id: familyId, name: input.familyName },
      member: { id: memberId, role: 'parent' },
      recoveryCodes,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || 'Invalid input' });
    }
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    req.session.userId = user.id;
    req.session.familyId = user.family_id;
    req.session.activeMemberId = null;

    res.json({
      user: { id: user.id, email: user.email, displayName: user.display_name },
      familyId: user.family_id,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session?.destroy(() => {
    res.clearCookie('fam.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.json({ user: null });
  const db = getDb();
  const user = db.prepare('SELECT id, email, display_name, family_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.json({ user: null });
  const family = db.prepare('SELECT id, name FROM families WHERE id = ?').get(user.family_id);
  const activeMember = req.session.activeMemberId
    ? db.prepare('SELECT id, name, role, avatar, color FROM family_members WHERE id = ? AND family_id = ?')
        .get(req.session.activeMemberId, user.family_id)
    : null;
  res.json({
    user: { id: user.id, email: user.email, displayName: user.display_name },
    family,
    activeMember,
  });
});

const selectSchema = z.object({
  memberId: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/),
});

router.post('/select-member', requireUser, pinLimiter, async (req, res, next) => {
  try {
    const { memberId, pin } = selectSchema.parse(req.body);
    const db = getDb();
    const member = db.prepare(
      'SELECT * FROM family_members WHERE id = ? AND family_id = ?'
    ).get(memberId, req.familyId);
    if (!member || !member.pin_hash) {
      return res.status(404).json({ error: 'Member not found or has no PIN set' });
    }
    const ok = await bcrypt.compare(pin, member.pin_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong PIN' });

    req.session.activeMemberId = member.id;
    res.json({
      activeMember: { id: member.id, name: member.name, role: member.role, avatar: member.avatar, color: member.color },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

router.post('/clear-active-member', requireUser, (req, res) => {
  req.session.activeMemberId = null;
  res.json({ ok: true });
});

const resetSchema = z.object({
  email: z.string().email(),
  recoveryCode: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

router.post('/reset-password', loginLimiter, async (req, res, next) => {
  try {
    const { email, recoveryCode, newPassword } = resetSchema.parse(req.body);
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or recovery code' });

    const codes = db.prepare(
      'SELECT * FROM recovery_codes WHERE user_id = ? AND used_at IS NULL'
    ).all(user.id);

    let matched = null;
    for (const row of codes) {
      if (await bcrypt.compare(recoveryCode, row.code_hash)) {
        matched = row;
        break;
      }
    }
    if (!matched) return res.status(401).json({ error: 'Invalid email or recovery code' });

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
      db.prepare('UPDATE recovery_codes SET used_at = datetime(\'now\') WHERE id = ?').run(matched.id);
    });
    tx();

    const remaining = db.prepare(
      'SELECT COUNT(*) as count FROM recovery_codes WHERE user_id = ? AND used_at IS NULL'
    ).get(user.id).count;

    res.json({ ok: true, remainingRecoveryCodes: remaining });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

// Change the family account password (signed-in parent; requires the current password).
router.post('/change-password', loginLimiter, requireUser, requireActiveMember, async (req, res, next) => {
  try {
    if (req.currentMember.role !== 'parent') return res.status(403).json({ error: 'Parent only' });
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different' });
    }
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.path?.[0] === 'newPassword' ? 'New password must be at least 8 characters' : 'Invalid input' });
    }
    next(err);
  }
});

// Regenerate recovery codes (requires active member = parent)
router.post('/regenerate-recovery-codes', requireUser, requireActiveMember, async (req, res, next) => {
  try {
    if (req.currentMember.role !== 'parent') return res.status(403).json({ error: 'Parent only' });
    const db = getDb();
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(req.userId);
      const insert = db.prepare('INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)');
      for (const h of hashes) insert.run(randomUUID(), req.userId, h);
    });
    tx();
    res.json({ recoveryCodes: codes });
  } catch (err) {
    next(err);
  }
});

export default router;
