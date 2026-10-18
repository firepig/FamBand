import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';
import { uploadExists, releaseQuestImage } from '../lib/uploads.js';
import { normalizeDays, toDateKey, parseDateKey, getRotationTurn } from '../lib/recurrence.js';
import { rotationConfig, currentTurn, setOrder, rotationSummary, templateOrder, parseRotation, applyRotation } from '../lib/rotation.js';
import { choreHasProgress } from '../lib/progress.js';

const router = Router();

const VALID_FREQ = new Set(['once', 'daily', 'weekdays', 'weekly', 'custom']);

function loadTemplate(db, id, familyId) {
  const t = db.prepare('SELECT * FROM chore_templates WHERE id = ? AND family_id = ?').get(id, familyId);
  if (!t) return null;
  const assignments = db.prepare(
    `SELECT fm.id, fm.name, fm.avatar, fm.color, fm.role
     FROM family_members fm
     JOIN chore_template_assignments cta ON fm.id = cta.member_id
     WHERE cta.template_id = ?
     ORDER BY cta.position ASC, cta.rowid ASC`
  ).all(id);
  const checklist = db.prepare(
    'SELECT * FROM chore_template_checklist WHERE template_id = ? ORDER BY order_index ASC, rowid ASC'
  ).all(id);
  return { ...t, assignments, checklist, rotation: rotationSummary(db, t) };
}

function memberBelongsToFamily(db, memberId, familyId) {
  return !!db.prepare('SELECT 1 FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId);
}

// After a series' players or shared/per-player layout change, line up its
// untouched open cards with the new layout: reassign a shared card, and remove
// cards that no longer fit so the next refresh regenerates the right ones.
// Cards anyone has started or finished are never touched, and materializeChores
// won't create a second card for a player who already has one today.
function reconcileOpenCards(db, templateId, todayKey) {
  const tpl = db.prepare('SELECT * FROM chore_templates WHERE id = ?').get(templateId);
  let players = db.prepare('SELECT member_id FROM chore_template_assignments WHERE template_id = ?')
    .all(templateId).map((r) => r.member_id);
  let perMember = !!tpl.per_member;
  if (tpl.up_for_grabs) {
    players = [];
    perMember = false;
  } else if (tpl.rotation_enabled) {
    // A rotating series has exactly one card per day: the on-duty player's.
    const turn = currentTurn(db, tpl);
    players = turn ? [turn.memberId] : [];
    perMember = true;
  }
  const open = db.prepare(
    `SELECT * FROM chores WHERE template_id = ? AND status = 'todo'
       AND (occurrence_date IS NULL OR occurrence_date >= ?)`
  ).all(templateId, todayKey);
  const delCard = db.prepare('DELETE FROM chores WHERE id = ?');
  const delAssign = db.prepare('DELETE FROM chore_assignments WHERE chore_id = ?');
  const addAssign = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)');
  for (const card of open) {
    if (choreHasProgress(db, card)) continue;
    if (perMember) {
      if (!card.instance_member_id || !players.includes(card.instance_member_id)) delCard.run(card.id);
    } else if (card.instance_member_id) {
      delCard.run(card.id); // a per-player card in a now-shared series
    } else {
      delAssign.run(card.id);
      players.forEach((mid) => addAssign.run(card.id, mid));
      if (tpl.up_for_grabs) db.prepare('UPDATE chores SET bounty = 1 WHERE id = ?').run(card.id);
    }
  }
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT id FROM chore_templates WHERE family_id = ? ORDER BY created_at DESC').all(req.familyId);
    res.json(rows.map((r) => loadTemplate(db, r.id, req.familyId)));
  } catch (err) {
    console.error('templates list', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const t = loadTemplate(db, req.params.id, req.familyId);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json(t);
  } catch (err) {
    console.error('templates get', err);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', requireActiveMember, requireParent, (req, res) => {
  try {
    const {
      title, description = '', points = 10, category = 'Chore',
      frequency = 'daily', daysOfWeek, interval = 1,
      startDate = null, endDate = null,
      assignedTo = [], checklist = [], active = true,
      perMember = true, image = null, rotation, upForGrabs = false,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (image && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });
    if (!VALID_FREQ.has(frequency)) return res.status(400).json({ error: `Invalid frequency: ${frequency}` });

    const db = getDb();
    const id = uuidv4();
    const days = normalizeDays(daysOfWeek);
    // Up for grabs: no assigned players; any player can take each day's card.
    const players = upForGrabs ? [] : (assignedTo || []).filter((mid, i, a) => a.indexOf(mid) === i && memberBelongsToFamily(db, mid, req.familyId));
    const rot = parseRotation(rotation);
    if (rot?.enabled && (frequency === 'once' || players.length < 2)) {
      return res.status(400).json({ error: 'Rotation needs a repeating quest with at least two players' });
    }

    const insertTpl = db.prepare(
      `INSERT INTO chore_templates
        (id, family_id, title, description, points, category, created_by, frequency, days_of_week, interval, start_date, end_date, active, per_member, image, up_for_grabs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertStep = db.prepare('INSERT INTO chore_template_checklist (id, template_id, text, order_index) VALUES (?, ?, ?, ?)');

    db.transaction(() => {
      insertTpl.run(
        id, req.familyId, title, description, points, category, req.currentMember.id,
        frequency, days, interval, startDate, endDate, active ? 1 : 0, perMember ? 1 : 0, image || null, upForGrabs ? 1 : 0
      );
      setOrder(db, id, players);
      (checklist || []).forEach((item, idx) => {
        if (item?.text) insertStep.run(uuidv4(), id, item.text, idx);
      });
      if (rot) applyRotation(db, id, rot, { enabled: false, order: [] }, new Date());
    })();

    res.status(201).json(loadTemplate(db, id, req.familyId));
  } catch (err) {
    console.error('templates create', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.patch('/:id', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM chore_templates WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const { title, description, points, category, frequency, daysOfWeek,
      interval, startDate, endDate, active, assignedTo, checklist, perMember, image, rotation, upForGrabs } = req.body || {};
    if (image && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });

    const today = new Date();
    const orderBefore = templateOrder(db, existing.id);
    const turnBefore = existing.rotation_enabled ? getRotationTurn(rotationConfig(db, existing), today) : null;
    const before = {
      enabled: !!existing.rotation_enabled, every: existing.rotation_every_weeks, dow: existing.rotation_start_dow,
      turn: turnBefore, order: orderBefore,
    };
    const grabs = upForGrabs !== undefined ? !!upForGrabs : !!existing.up_for_grabs;
    const players = grabs ? [] : Array.isArray(assignedTo)
      ? assignedTo.filter((mid, i, a) => a.indexOf(mid) === i && memberBelongsToFamily(db, mid, req.familyId))
      : orderBefore;
    const rot = parseRotation(rotation, {
      enabled: !!existing.rotation_enabled, everyWeeks: existing.rotation_every_weeks, startDow: existing.rotation_start_dow,
    });
    const rotationOnAfter = grabs ? false : (rot ? rot.enabled : !!existing.rotation_enabled);
    const freqAfter = frequency !== undefined ? frequency : existing.frequency;
    // Ending the repeat (frequency 'once') also ends the rotation, so only validate otherwise.
    if (rotationOnAfter && frequency !== 'once' && (freqAfter === 'once' || players.length < 2)) {
      return res.status(400).json({ error: 'Rotation needs a repeating quest with at least two players' });
    }

    const setCols = [];
    const setVals = [];
    const push = (col, val) => { setCols.push(`${col} = ?`); setVals.push(val); };

    if (title !== undefined) push('title', title);
    if (description !== undefined) push('description', description);
    if (points !== undefined) push('points', points);
    if (category !== undefined) push('category', category);
    if (frequency !== undefined) {
      if (!VALID_FREQ.has(frequency)) return res.status(400).json({ error: 'Invalid frequency' });
      push('frequency', frequency);
    }
    if (daysOfWeek !== undefined) push('days_of_week', normalizeDays(daysOfWeek));
    if (interval !== undefined) push('interval', interval);
    if (startDate !== undefined) push('start_date', startDate);
    if (endDate !== undefined) push('end_date', endDate);
    if (active !== undefined) push('active', active ? 1 : 0);
    if (perMember !== undefined) push('per_member', perMember ? 1 : 0);
    if (image !== undefined) push('image', image || null);
    if (upForGrabs !== undefined) push('up_for_grabs', upForGrabs ? 1 : 0);

    db.transaction(() => {
      if (setCols.length) {
        setVals.push(req.params.id);
        db.prepare(`UPDATE chore_templates SET ${setCols.join(', ')} WHERE id = ?`).run(...setVals);
      }
      if (Array.isArray(assignedTo) || upForGrabs !== undefined) setOrder(db, req.params.id, players);
      if (grabs) {
        db.prepare('UPDATE chore_templates SET rotation_enabled = 0 WHERE id = ?').run(req.params.id);
      } else if (frequency === 'once') {
        db.prepare('UPDATE chore_templates SET rotation_enabled = 0 WHERE id = ?').run(req.params.id);
      } else if (rot) {
        applyRotation(db, req.params.id, rot, before, today);
      } else if (existing.rotation_enabled && Array.isArray(assignedTo)) {
        // Players changed on a rotating series without touching its settings: keep the current turn.
        applyRotation(db, req.params.id,
          { enabled: true, everyWeeks: existing.rotation_every_weeks, startDow: existing.rotation_start_dow, firstMemberId: null },
          before, today);
      }
      if (Array.isArray(checklist)) {
        db.prepare('DELETE FROM chore_template_checklist WHERE template_id = ?').run(req.params.id);
        const ins = db.prepare('INSERT INTO chore_template_checklist (id, template_id, text, order_index) VALUES (?, ?, ?, ?)');
        checklist.forEach((item, idx) => {
          if (item?.text) ins.run(uuidv4(), req.params.id, item.text, idx);
        });
      }
    })();

    // Keep already-spawned, still-open quests in step with the series. Done/failed
    // history is left alone. Ending the repeat detaches the open ones so they
    // become ordinary one-off quests.
    const openInstances = "template_id = ? AND status IN ('todo','in_progress') AND (occurrence_date IS NULL OR occurrence_date >= ?)";
    const todayKey = toDateKey(new Date());
    // Always carry the edited name/points/etc. onto open cards first, so that even
    // when the series is ending they keep the values that were just saved.
    const sets = [];
    const vals = [];
    for (const [col, val] of Object.entries({ title, description, points, category, image })) {
      if (val === undefined) continue;
      sets.push(`${col} = ?`);
      vals.push(col === 'image' ? (val || null) : val);
    }
    if (sets.length) {
      db.prepare(`UPDATE chores SET ${sets.join(', ')} WHERE ${openInstances}`).run(...vals, req.params.id, todayKey);
    }

    if (frequency === 'once') {
      db.prepare(`UPDATE chores SET template_id = NULL, occurrence_date = NULL, instance_member_id = NULL WHERE ${openInstances}`)
        .run(req.params.id, todayKey);
    } else if (Array.isArray(assignedTo) || perMember !== undefined || rotation !== undefined || upForGrabs !== undefined) {
      reconcileOpenCards(db, req.params.id, todayKey);
    }

    if (image !== undefined && existing.image && existing.image !== image) releaseQuestImage(db, existing.image);

    res.json(loadTemplate(db, req.params.id, req.familyId));
  } catch (err) {
    console.error('templates patch', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/:id', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const t = db.prepare('SELECT id, image FROM chore_templates WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    db.prepare('DELETE FROM chore_templates WHERE id = ?').run(req.params.id);
    releaseQuestImage(db, t.image);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('templates delete', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Swap or skip one turn of a rotating series (parents). Only that turn changes;
// the turns after it stay exactly as scheduled.
router.post('/:id/overrides', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const tpl = db.prepare('SELECT * FROM chore_templates WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    if (!tpl.rotation_enabled) return res.status(400).json({ error: 'This quest does not rotate' });

    const { kind, memberId, periodStart } = req.body || {};
    if (kind !== 'swap' && kind !== 'skip') return res.status(400).json({ error: 'kind must be swap or skip' });

    const cfg = rotationConfig(db, tpl);
    const today = new Date();
    const target = periodStart ? parseDateKey(periodStart) : today;
    if (!target) return res.status(400).json({ error: 'Invalid date' });
    const turn = getRotationTurn(cfg, target);
    const current = getRotationTurn(cfg, today);
    if (!turn || !current) return res.status(400).json({ error: 'Rotation has not started for that date' });
    if (turn.turnStart < current.turnStart) return res.status(400).json({ error: 'That turn is already over' });
    const farthest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7 * 26);
    if (target > farthest) return res.status(400).json({ error: 'Too far in the future' });
    if (kind === 'swap' && (!memberId || !cfg.order.includes(memberId) || memberId === turn.scheduledMemberId)) {
      return res.status(400).json({ error: 'Pick a different player from the rotation' });
    }

    db.transaction(() => {
      db.prepare('INSERT OR REPLACE INTO chore_template_overrides (template_id, period_start, kind, member_id) VALUES (?, ?, ?, ?)')
        .run(tpl.id, turn.turnStart, kind, kind === 'swap' ? memberId : null);
      if (turn.turnStart === current.turnStart) reconcileOpenCards(db, tpl.id, toDateKey(today));
    })();
    res.status(201).json(loadTemplate(db, tpl.id, req.familyId));
  } catch (err) {
    console.error('templates override', err);
    res.status(500).json({ error: 'Failed to save override' });
  }
});

router.delete('/:id/overrides/:periodStart', requireActiveMember, requireParent, (req, res) => {
  try {
    const db = getDb();
    const tpl = db.prepare('SELECT * FROM chore_templates WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    db.transaction(() => {
      db.prepare('DELETE FROM chore_template_overrides WHERE template_id = ? AND period_start = ?').run(tpl.id, req.params.periodStart);
      const turn = currentTurn(db, tpl);
      if (turn && turn.turnStart === req.params.periodStart) reconcileOpenCards(db, tpl.id, toDateKey(new Date()));
    })();
    res.json(loadTemplate(db, tpl.id, req.familyId));
  } catch (err) {
    console.error('templates override delete', err);
    res.status(500).json({ error: 'Failed to remove override' });
  }
});

export default router;
