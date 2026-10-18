import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireActiveMember, requireParent } from '../middleware/auth.js';
import { uploadExists, releaseQuestImage } from '../lib/uploads.js';
import { normalizeDays, toDateKey } from '../lib/recurrence.js';

const router = Router();

const VALID_FREQ = new Set(['once', 'daily', 'weekdays', 'weekly', 'custom']);

function loadTemplate(db, id, familyId) {
  const t = db.prepare('SELECT * FROM chore_templates WHERE id = ? AND family_id = ?').get(id, familyId);
  if (!t) return null;
  const assignments = db.prepare(
    `SELECT fm.id, fm.name, fm.avatar, fm.color, fm.role
     FROM family_members fm
     JOIN chore_template_assignments cta ON fm.id = cta.member_id
     WHERE cta.template_id = ?`
  ).all(id);
  const checklist = db.prepare(
    'SELECT * FROM chore_template_checklist WHERE template_id = ? ORDER BY order_index ASC, rowid ASC'
  ).all(id);
  return { ...t, assignments, checklist };
}

function memberBelongsToFamily(db, memberId, familyId) {
  return !!db.prepare('SELECT 1 FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId);
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
      perMember = true, image = null,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (image && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });
    if (!VALID_FREQ.has(frequency)) return res.status(400).json({ error: `Invalid frequency: ${frequency}` });

    const db = getDb();
    const id = uuidv4();
    const days = normalizeDays(daysOfWeek);

    const insertTpl = db.prepare(
      `INSERT INTO chore_templates
        (id, family_id, title, description, points, category, created_by, frequency, days_of_week, interval, start_date, end_date, active, per_member, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAssign = db.prepare('INSERT INTO chore_template_assignments (template_id, member_id) VALUES (?, ?)');
    const insertStep = db.prepare('INSERT INTO chore_template_checklist (id, template_id, text, order_index) VALUES (?, ?, ?, ?)');

    db.transaction(() => {
      insertTpl.run(
        id, req.familyId, title, description, points, category, req.currentMember.id,
        frequency, days, interval, startDate, endDate, active ? 1 : 0, perMember ? 1 : 0, image || null
      );
      (assignedTo || []).forEach((mid) => {
        if (memberBelongsToFamily(db, mid, req.familyId)) insertAssign.run(id, mid);
      });
      (checklist || []).forEach((item, idx) => {
        if (item?.text) insertStep.run(uuidv4(), id, item.text, idx);
      });
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
    const existing = db.prepare('SELECT id, image FROM chore_templates WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const { title, description, points, category, frequency, daysOfWeek,
      interval, startDate, endDate, active, assignedTo, checklist, perMember, image } = req.body || {};
    if (image && !uploadExists('quest', image)) return res.status(400).json({ error: 'Unknown image' });

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

    db.transaction(() => {
      if (setCols.length) {
        setVals.push(req.params.id);
        db.prepare(`UPDATE chore_templates SET ${setCols.join(', ')} WHERE id = ?`).run(...setVals);
      }
      if (Array.isArray(assignedTo)) {
        db.prepare('DELETE FROM chore_template_assignments WHERE template_id = ?').run(req.params.id);
        const ins = db.prepare('INSERT INTO chore_template_assignments (template_id, member_id) VALUES (?, ?)');
        assignedTo.forEach((mid) => {
          if (memberBelongsToFamily(db, mid, req.familyId)) ins.run(req.params.id, mid);
        });
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
    if (frequency === 'once') {
      db.prepare(`UPDATE chores SET template_id = NULL, occurrence_date = NULL, instance_member_id = NULL WHERE ${openInstances}`)
        .run(req.params.id, todayKey);
    } else {
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

export default router;
