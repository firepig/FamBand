import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

const router = Router();

const VALID_FREQ = new Set(['once', 'daily', 'weekdays', 'weekly', 'custom']);

function loadTemplate(db, id) {
  const t = db.prepare('SELECT * FROM chore_templates WHERE id = ?').get(id);
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

function normalizeDays(input) {
  if (input == null) return '';
  if (Array.isArray(input)) {
    return input
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      .join(',');
  }
  return String(input);
}

// GET /api/templates
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT id FROM chore_templates ORDER BY created_at DESC').all();
    res.json(rows.map((r) => loadTemplate(db, r.id)));
  } catch (err) {
    console.error('templates list', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/templates/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const t = loadTemplate(db, req.params.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json(t);
  } catch (err) {
    console.error('templates get', err);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// POST /api/templates
router.post('/', (req, res) => {
  try {
    const {
      title, description = '', points = 10, category = 'Chore', createdBy,
      frequency = 'daily', daysOfWeek, interval = 1,
      startDate = null, endDate = null,
      assignedTo = [], checklist = [], active = true,
      perMember = true,
    } = req.body || {};

    if (!title || !createdBy) {
      return res.status(400).json({ error: 'title and createdBy are required' });
    }
    if (!VALID_FREQ.has(frequency)) {
      return res.status(400).json({ error: `Invalid frequency: ${frequency}` });
    }

    const db = getDb();
    const id = uuidv4();
    const days = normalizeDays(daysOfWeek);

    const insertTpl = db.prepare(
      `INSERT INTO chore_templates
        (id, title, description, points, category, created_by, frequency, days_of_week, interval, start_date, end_date, active, per_member)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAssign = db.prepare(
      'INSERT INTO chore_template_assignments (template_id, member_id) VALUES (?, ?)'
    );
    const insertStep = db.prepare(
      'INSERT INTO chore_template_checklist (id, template_id, text, order_index) VALUES (?, ?, ?, ?)'
    );

    db.transaction(() => {
      insertTpl.run(
        id, title, description, points, category, createdBy,
        frequency, days, interval, startDate, endDate, active ? 1 : 0,
        perMember ? 1 : 0
      );
      (assignedTo || []).forEach((mid) => insertAssign.run(id, mid));
      (checklist || []).forEach((item, idx) => {
        if (item?.text) insertStep.run(uuidv4(), id, item.text, idx);
      });
    })();

    res.status(201).json(loadTemplate(db, id));
  } catch (err) {
    console.error('templates create', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PATCH /api/templates/:id
router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM chore_templates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const {
      title, description, points, category, frequency, daysOfWeek,
      interval, startDate, endDate, active, assignedTo, checklist,
      perMember,
    } = req.body || {};

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

    db.transaction(() => {
      if (setCols.length) {
        setVals.push(req.params.id);
        db.prepare(`UPDATE chore_templates SET ${setCols.join(', ')} WHERE id = ?`).run(...setVals);
      }
      if (Array.isArray(assignedTo)) {
        db.prepare('DELETE FROM chore_template_assignments WHERE template_id = ?').run(req.params.id);
        const ins = db.prepare('INSERT INTO chore_template_assignments (template_id, member_id) VALUES (?, ?)');
        assignedTo.forEach((mid) => ins.run(req.params.id, mid));
      }
      if (Array.isArray(checklist)) {
        db.prepare('DELETE FROM chore_template_checklist WHERE template_id = ?').run(req.params.id);
        const ins = db.prepare('INSERT INTO chore_template_checklist (id, template_id, text, order_index) VALUES (?, ?, ?, ?)');
        checklist.forEach((item, idx) => {
          if (item?.text) ins.run(uuidv4(), req.params.id, item.text, idx);
        });
      }
    })();

    res.json(loadTemplate(db, req.params.id));
  } catch (err) {
    console.error('templates patch', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/templates/:id — also unlinks existing instances (template_id → NULL via FK)
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const t = db.prepare('SELECT id FROM chore_templates WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    db.prepare('DELETE FROM chore_templates WHERE id = ?').run(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('templates delete', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
