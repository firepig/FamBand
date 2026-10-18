import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDb() first.');
  }
  return db;
}

export function initializeDb() {
  const dataDir = path.resolve(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'famband.db');
  db = new Database(dbPath);

  // Enable WAL mode and foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('parent','child')),
      avatar TEXT DEFAULT '👤',
      color TEXT DEFAULT '#6c757d'
    );

    CREATE TABLE IF NOT EXISTS chores (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      points INTEGER DEFAULT 10,
      status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      due_date TEXT,
      category TEXT DEFAULT 'general',
      photo_proof TEXT,
      points_approved INTEGER DEFAULT 0,
      approved_by TEXT,
      FOREIGN KEY (created_by) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS chore_assignments (
      chore_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      PRIMARY KEY (chore_id, member_id),
      FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      chore_id TEXT NOT NULL,
      text TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS points_ledger (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('earned','spent','escrow','released')),
      chore_id TEXT,
      description TEXT,
      approved_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS bulletin_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS homework_items (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_date TEXT,
      completed INTEGER DEFAULT 0,
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS snack_shop (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cost INTEGER NOT NULL,
      image TEXT DEFAULT '🍬',
      available INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS member_snacks (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      snack_id TEXT NOT NULL,
      redeemed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES family_members(id),
      FOREIGN KEY (snack_id) REFERENCES snack_shop(id)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT '🏆',
      criteria TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member_achievements (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES family_members(id),
      FOREIGN KEY (achievement_id) REFERENCES achievements(id)
    );

    /* === Recurring chore templates ===
       frequency: once | daily | weekdays | weekly | custom
       days_of_week: CSV of 0-6 (Sun=0) — required when frequency='custom' or 'weekly'
       interval: every N units of frequency (default 1)
       start_date / end_date: bounds the recurrence (YYYY-MM-DD, nullable)
    */
    CREATE TABLE IF NOT EXISTS chore_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      points INTEGER DEFAULT 10,
      category TEXT DEFAULT 'Chore',
      created_by TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily'
        CHECK(frequency IN ('once','daily','weekdays','weekly','custom')),
      days_of_week TEXT DEFAULT '',
      interval INTEGER DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      active INTEGER DEFAULT 1,
      per_member INTEGER DEFAULT 1, /* 1 = one instance per assignee per day, 0 = shared */
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS chore_template_assignments (
      template_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      PRIMARY KEY (template_id, member_id),
      FOREIGN KEY (template_id) REFERENCES chore_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS chore_template_checklist (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      text TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES chore_templates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chores_status ON chores(status);
  `);

  // === Idempotent ALTER TABLE migrations ===
  // SQLite has no IF NOT EXISTS for ADD COLUMN; check pragma first.
  const choreCols = db.prepare("PRAGMA table_info(chores)").all().map((c) => c.name);
  if (!choreCols.includes('template_id')) {
    db.exec(`ALTER TABLE chores ADD COLUMN template_id TEXT REFERENCES chore_templates(id) ON DELETE SET NULL`);
  }
  if (!choreCols.includes('occurrence_date')) {
    db.exec(`ALTER TABLE chores ADD COLUMN occurrence_date TEXT`);
  }

  // CHECK constraints can't be altered in place — rebuild table to add 'failed' status.
  // Idempotent: detect whether the current schema already permits 'failed'.
  const choreSchemaSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='chores'"
  ).get()?.sql || '';
  if (!choreSchemaSql.includes("'failed'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE chores__new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        points INTEGER DEFAULT 10,
        status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done','failed')),
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        due_date TEXT,
        category TEXT DEFAULT 'general',
        photo_proof TEXT,
        points_approved INTEGER DEFAULT 0,
        approved_by TEXT,
        template_id TEXT REFERENCES chore_templates(id) ON DELETE SET NULL,
        occurrence_date TEXT,
        FOREIGN KEY (created_by) REFERENCES family_members(id)
      );
      INSERT INTO chores__new
        (id, title, description, points, status, created_by, created_at, due_date, category, photo_proof, points_approved, approved_by, template_id, occurrence_date)
        SELECT id, title, description, points, status, created_by, created_at, due_date, category, photo_proof, points_approved, approved_by, template_id, occurrence_date
        FROM chores;
      DROP TABLE chores;
      ALTER TABLE chores__new RENAME TO chores;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  // Idempotent ADD COLUMN for per-member splitting
  const choreCols2 = db.prepare("PRAGMA table_info(chores)").all().map((c) => c.name);
  if (!choreCols2.includes('instance_member_id')) {
    db.exec(`ALTER TABLE chores ADD COLUMN instance_member_id TEXT`);
  }
  const tplCols = db.prepare("PRAGMA table_info(chore_templates)").all().map((c) => c.name);
  if (!tplCols.includes('per_member')) {
    db.exec(`ALTER TABLE chore_templates ADD COLUMN per_member INTEGER DEFAULT 1`);
  }

  // Create indexes (re-run safe). The unique index now includes instance_member_id so
  // per-member templates can have one row per (template, date, member); shared templates
  // (instance_member_id IS NULL) are uniqued in code, since SQLite treats NULLs as distinct.
  db.exec(`
    DROP INDEX IF EXISTS uq_chores_template_occurrence;
    CREATE INDEX IF NOT EXISTS idx_chores_template ON chores(template_id);
    CREATE INDEX IF NOT EXISTS idx_chores_occurrence ON chores(occurrence_date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_chores_template_occurrence_member
      ON chores(template_id, occurrence_date, instance_member_id) WHERE template_id IS NOT NULL;
  `);

  // Seed default family members
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM family_members').get();
  if (memberCount.count === 0) {
    const insertMember = db.prepare(
      'INSERT INTO family_members (id, name, role, avatar, color) VALUES (?, ?, ?, ?, ?)'
    );
    const members = [
      ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Kory', 'parent', '🧔', '#0d6efd'],
      ['b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Krystina', 'parent', '👩‍🦰', '#d63384'],
      ['c3d4e5f6-a7b8-9012-cdef-123456789012', 'Leda', 'child', '🧒', '#198754'],
      ['d4e5f6a7-b8c9-0123-defa-234567890123', 'Nash', 'child', '👦', '#fd7e14'],
      ['e5f6a7b8-c9d0-1234-efab-345678901234', 'Elara', 'child', '👶', '#6f42c1'],
    ];
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insertMember.run(...row);
      }
    });
    insertMany(members);
  }

  // Seed default achievements
  const achievementCount = db.prepare('SELECT COUNT(*) as count FROM achievements').get();
  if (achievementCount.count === 0) {
    const insertAchievement = db.prepare(
      'INSERT INTO achievements (id, name, description, icon, criteria) VALUES (?, ?, ?, ?, ?)'
    );
    const achievements = [
      ['ach-001', 'First Steps', 'Complete first chore', '🌟', '{"type":"chores_completed","threshold":1}'],
      ['ach-002', 'Chore Champ', 'Complete 10 chores', '⭐', '{"type":"chores_completed","threshold":10}'],
      ['ach-003', 'Point Collector', 'Earn 100 points', '💰', '{"type":"points_earned","threshold":100}'],
      ['ach-004', 'Streak Master', '7 day streak', '🔥', '{"type":"streak","threshold":7}'],
      ['ach-005', 'Helper Hero', 'Complete 5 chores in one day', '🦸', '{"type":"daily_chores","threshold":5}'],
      ['ach-006', 'Snack Saver', 'Redeem first snack', '🍪', '{"type":"snacks_redeemed","threshold":1}'],
    ];
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insertAchievement.run(...row);
      }
    });
    insertMany(achievements);
  }

  // Seed default snack shop items
  const snackCount = db.prepare('SELECT COUNT(*) as count FROM snack_shop').get();
  if (snackCount.count === 0) {
    const insertSnack = db.prepare(
      'INSERT INTO snack_shop (id, name, description, cost, image, available) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const snacks = [
      ['snack-001', 'Ice Cream Sundae', 'Build your own sundae with all the toppings!', 50, '🍨', 1],
      ['snack-002', 'Extra Screen Time (30min)', 'Get an extra 30 minutes of screen time', 30, '📱', 1],
      ['snack-003', 'Choose Dinner Menu', 'You pick what we have for dinner tonight', 40, '🍽️', 1],
      ['snack-004', 'Movie Night Pick', 'You choose the movie for family movie night', 60, '🎬', 1],
      ['snack-005', 'Stay Up 30min Late', 'Stay awake 30 minutes past bedtime', 45, '🌙', 1],
    ];
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insertSnack.run(...row);
      }
    });
    insertMany(snacks);
  }

  return db;
}
