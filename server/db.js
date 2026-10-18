import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
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

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      user_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('parent','child')),
      pin_hash TEXT,
      avatar TEXT DEFAULT '👤',
      color TEXT DEFAULT '#6c757d',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chores (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
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
      template_id TEXT,
      occurrence_date TEXT,
      instance_member_id TEXT,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES family_members(id),
      FOREIGN KEY (template_id) REFERENCES chore_templates(id) ON DELETE SET NULL
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

    CREATE TABLE IF NOT EXISTS chore_templates (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
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
      per_member INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS chore_template_assignments (
      template_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      PRIMARY KEY (template_id, member_id),
      FOREIGN KEY (template_id) REFERENCES chore_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS chore_template_overrides (
      template_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('swap','skip')),
      member_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (template_id, period_start),
      FOREIGN KEY (template_id) REFERENCES chore_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chore_template_checklist (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      text TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES chore_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS points_ledger (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      member_id TEXT,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('earned','spent','escrow','released')),
      chore_id TEXT,
      description TEXT,
      approved_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS cash_outs (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      member_id TEXT,
      points INTEGER NOT NULL,
      cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'owed' CHECK(status IN ('owed','paid')),
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      paid_by TEXT,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS bulletin_posts (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS homework_items (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_date TEXT,
      completed INTEGER DEFAULT 0,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS snack_shop (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cost INTEGER NOT NULL,
      image TEXT DEFAULT '🍬',
      available INTEGER DEFAULT 1,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS member_snacks (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      snack_id TEXT NOT NULL,
      redeemed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
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
      family_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id),
      FOREIGN KEY (achievement_id) REFERENCES achievements(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chores_status ON chores(status);
    CREATE INDEX IF NOT EXISTS idx_chores_family ON chores(family_id);
    CREATE INDEX IF NOT EXISTS idx_chores_template ON chores(template_id);
    CREATE INDEX IF NOT EXISTS idx_chores_occurrence ON chores(occurrence_date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_chores_template_occurrence_member
      ON chores(template_id, occurrence_date, instance_member_id) WHERE template_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_members_family ON family_members(family_id);
    CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);
    CREATE INDEX IF NOT EXISTS idx_bulletin_family ON bulletin_posts(family_id);
    CREATE INDEX IF NOT EXISTS idx_homework_family ON homework_items(family_id);
    CREATE INDEX IF NOT EXISTS idx_snacks_family ON snack_shop(family_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_family ON points_ledger(family_id);
  `);

  // Lightweight additive migrations for databases created before a column existed.
  const addColumnIfMissing = (table, column, ddl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  };
  // points_ledger.member_id used to be NOT NULL with no delete rule, which made it
  // impossible to remove a member. Rebuild once so history can outlive the member
  // (the row is kept and simply loses its owner). SQLite can't alter this in place.
  const ledgerMemberCol = db.prepare('PRAGMA table_info(points_ledger)').all().find((c) => c.name === 'member_id');
  if (ledgerMemberCol && ledgerMemberCol.notnull) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE points_ledger_new (
          id TEXT PRIMARY KEY,
          family_id TEXT NOT NULL,
          member_id TEXT,
          amount INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('earned','spent','escrow','released')),
          chore_id TEXT,
          description TEXT,
          approved_by TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
          FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE SET NULL
        );
        INSERT INTO points_ledger_new (id, family_id, member_id, amount, type, chore_id, description, approved_by, created_at)
          SELECT id, family_id, member_id, amount, type, chore_id, description, approved_by, created_at FROM points_ledger;
        DROP TABLE points_ledger;
        ALTER TABLE points_ledger_new RENAME TO points_ledger;
        CREATE INDEX IF NOT EXISTS idx_ledger_family ON points_ledger(family_id);
      `);
    })();
  }
  // Rotating assignments: players take turns on a repeating quest.
  addColumnIfMissing('chore_template_assignments', 'position', 'INTEGER');
  db.exec('UPDATE chore_template_assignments SET position = rowid WHERE position IS NULL');
  // Bounty quests: nobody is assigned, any player can take one. `bounty` marks a quest that
  // started life up for grabs (so a claimer may give it back); `up_for_grabs` makes a repeating
  // series produce one unassigned card a day.
  addColumnIfMissing('chores', 'bounty', 'INTEGER DEFAULT 0');
  addColumnIfMissing('chore_templates', 'up_for_grabs', 'INTEGER DEFAULT 0');
  addColumnIfMissing('chore_templates', 'rotation_enabled', 'INTEGER DEFAULT 0');
  addColumnIfMissing('chore_templates', 'rotation_every_weeks', 'INTEGER DEFAULT 1');
  addColumnIfMissing('chore_templates', 'rotation_start_dow', 'INTEGER DEFAULT 0');
  addColumnIfMissing('chore_templates', 'rotation_anchor_date', 'TEXT');
  addColumnIfMissing('chore_templates', 'rotation_anchor_member', 'TEXT');
  addColumnIfMissing('chores', 'image', 'TEXT');
  addColumnIfMissing('chore_templates', 'image', 'TEXT');

  // Seed achievement catalog (global, not per-family)
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
      for (const row of rows) insertAchievement.run(...row);
    });
    insertMany(achievements);
  }

  return db;
}

// Seeds a brand-new family with starter snack shop items. Called from auth/register.
export function seedFamilyDefaults(familyId) {
  const database = getDb();
  const insertSnack = database.prepare(
    'INSERT INTO snack_shop (id, family_id, name, description, cost, image, available) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const snacks = [
    ['Ice Cream Sundae', 'Build your own sundae with all the toppings!', 50, '🍨'],
    ['Extra Screen Time (30min)', 'Get an extra 30 minutes of screen time', 30, '📱'],
    ['Choose Dinner Menu', 'You pick what we have for dinner tonight', 40, '🍽️'],
    ['Movie Night Pick', 'You choose the movie for family movie night', 60, '🎬'],
    ['Stay Up 30min Late', 'Stay awake 30 minutes past bedtime', 45, '🌙'],
  ];
  const tx = database.transaction((rows) => {
    for (const [name, desc, cost, image] of rows) {
      insertSnack.run(randomUUID(), familyId, name, desc, cost, image, 1);
    }
  });
  tx(snacks);
}
