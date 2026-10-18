import { v4 as uuidv4 } from 'uuid';
import { getOccurrences, toDateKey, getRotationTurn } from './recurrence.js';
import { rotationConfig } from './rotation.js';

/**
 * One-instance-at-a-time policy for recurring chores.
 *
 *   1. AUTO-FAIL: any template-spawned chore whose occurrence_date is in the
 *      past and is still 'todo' or 'in_progress' is marked 'failed'. Done
 *      chores (whether approved or pending) are protected.
 *
 *   2. CLEAN-AHEAD: future-dated template chores still in 'todo' with no
 *      progress are deleted (cleanup of stale wide-lookahead instances).
 *
 *   3. MATERIALIZE today's occurrences:
 *        - per_member = 1 → one chore per assignee (their own card)
 *        - per_member = 0 → one shared chore assigned to all listed members
 *
 * Returns { inserted, failed, cleaned } counts.
 */
export function materializeChores(db, familyId) {
  if (!familyId) throw new Error('materializeChores: familyId is required');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = toDateKey(today);

  let inserted = 0;
  let failed = 0;
  let cleaned = 0;

  const tx = db.transaction(() => {
    // 1) Auto-fail past unfinished template instances. 'done' is protected.
    const failResult = db.prepare(
      `UPDATE chores
         SET status = 'failed'
       WHERE family_id = ?
         AND template_id IS NOT NULL
         AND occurrence_date IS NOT NULL
         AND occurrence_date < ?
         AND status IN ('todo', 'in_progress')`
    ).run(familyId, todayKey);
    failed = failResult.changes;

    // 2) Clean up untouched future instances.
    const futureStale = db.prepare(
      `SELECT c.id FROM chores c
        WHERE c.family_id = ?
          AND c.template_id IS NOT NULL
          AND c.occurrence_date IS NOT NULL
          AND c.occurrence_date > ?
          AND c.status = 'todo'
          AND (c.photo_proof IS NULL OR c.photo_proof = '')
          AND NOT EXISTS (
            SELECT 1 FROM checklist_items ci
             WHERE ci.chore_id = c.id AND ci.completed = 1
          )`
    ).all(familyId, todayKey);
    if (futureStale.length > 0) {
      const del = db.prepare('DELETE FROM chores WHERE id = ?');
      for (const r of futureStale) {
        del.run(r.id);
        cleaned += 1;
      }
    }

    // 3) Materialize today's occurrences
    const templates = db.prepare(
      `SELECT * FROM chore_templates WHERE family_id = ? AND active = 1 AND frequency != 'once'`
    ).all(familyId);

    const insertChore = db.prepare(
      `INSERT INTO chores
        (id, family_id, title, description, points, status, created_by, due_date, category,
         template_id, occurrence_date, instance_member_id, image, bounty)
       VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAssign = db.prepare(
      'INSERT OR IGNORE INTO chore_assignments (chore_id, member_id) VALUES (?, ?)'
    );
    const insertStep = db.prepare(
      'INSERT INTO checklist_items (id, chore_id, text) VALUES (?, ?, ?)'
    );

    const createInstance = (tpl, memberIds, instanceMemberId) => {
      const choreId = uuidv4();
      try {
        insertChore.run(
          choreId, familyId, tpl.title, tpl.description || '', tpl.points || 10,
          tpl.created_by, todayKey, tpl.category || 'Chore',
          tpl.id, todayKey, instanceMemberId, tpl.image || null, tpl.up_for_grabs ? 1 : 0,
        );
      } catch (err) {
        // Unique index conflict (already exists) — skip
        if (String(err.message).includes('UNIQUE')) return false;
        throw err;
      }
      for (const mid of memberIds) insertAssign.run(choreId, mid);
      const steps = db.prepare(
        'SELECT text FROM chore_template_checklist WHERE template_id = ? ORDER BY order_index ASC, rowid ASC'
      ).all(tpl.id);
      for (const s of steps) if (s.text) insertStep.run(uuidv4(), choreId, s.text);
      return true;
    };

    for (const tpl of templates) {
      if (getOccurrences(tpl, today, today).length === 0) continue;

      const assignments = db.prepare(
        'SELECT member_id FROM chore_template_assignments WHERE template_id = ?'
      ).all(tpl.id).map((r) => r.member_id);

      if (tpl.up_for_grabs) {
        // Bounty series: one unassigned card a day that any player can take.
        const exists = db.prepare(
          'SELECT 1 FROM chores WHERE template_id = ? AND occurrence_date = ? LIMIT 1'
        ).get(tpl.id, todayKey);
        if (exists) continue;
        if (createInstance(tpl, [], null)) inserted += 1;
        continue;
      }

      if (tpl.rotation_enabled) {
        // Players take turns: one card per day, for whoever is on duty today. If the series
        // already has a card today (anyone's, any status) leave it alone.
        const turn = getRotationTurn(rotationConfig(db, tpl), today);
        if (!turn) continue;
        const exists = db.prepare(
          'SELECT 1 FROM chores WHERE template_id = ? AND occurrence_date = ? LIMIT 1'
        ).get(tpl.id, todayKey);
        if (exists) continue;
        if (createInstance(tpl, [turn.memberId], turn.memberId)) inserted += 1;
        continue;
      }

      if (tpl.per_member) {
        // One instance per assignee
        for (const mid of assignments) {
          // Covered if any of today's cards for this series (per-player OR shared,
          // any status) already includes this player. Switching a series between
          // shared and per-player mode must never double up a player's card.
          const exists = db.prepare(
            `SELECT 1 FROM chores c JOIN chore_assignments ca ON ca.chore_id = c.id
              WHERE c.template_id = ? AND c.occurrence_date = ? AND ca.member_id = ? LIMIT 1`
          ).get(tpl.id, todayKey, mid);
          if (exists) continue;
          if (createInstance(tpl, [mid], mid)) inserted += 1;
        }
      } else {
        // One shared instance for all assignees
        const exists = db.prepare(
          'SELECT 1 FROM chores WHERE template_id = ? AND occurrence_date = ? LIMIT 1'
        ).get(tpl.id, todayKey);
        if (exists) continue;
        if (createInstance(tpl, assignments, null)) inserted += 1;
      }
    }
  });
  tx();

  return { inserted, failed, cleaned };
}
