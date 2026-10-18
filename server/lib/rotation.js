import { getRotationTurn, getUpcomingTurns, toDateKey } from './recurrence.js';

// Database-side helpers for rotating repeating quests. The calendar math lives in
// recurrence.js (getRotationTurn); everything here just feeds it and keeps the
// anchor stable when players or settings change.

export function templateOrder(db, templateId) {
  return db.prepare(
    'SELECT member_id FROM chore_template_assignments WHERE template_id = ? ORDER BY position ASC, rowid ASC'
  ).all(templateId).map((r) => r.member_id);
}

export function rotationConfig(db, tpl) {
  return {
    order: templateOrder(db, tpl.id),
    anchorMember: tpl.rotation_anchor_member,
    anchorDate: tpl.rotation_anchor_date,
    everyWeeks: tpl.rotation_every_weeks,
    startDow: tpl.rotation_start_dow,
    overrides: db.prepare(
      'SELECT period_start, kind, member_id FROM chore_template_overrides WHERE template_id = ?'
    ).all(tpl.id),
  };
}

/** Today's turn for a rotating template, or null (not rotating / not started / no players). */
export function currentTurn(db, tpl, date = new Date()) {
  if (!tpl.rotation_enabled) return null;
  return getRotationTurn(rotationConfig(db, tpl), date);
}

/** Replace a template's players with `memberIds`, remembering their order. */
export function setOrder(db, templateId, memberIds) {
  db.prepare('DELETE FROM chore_template_assignments WHERE template_id = ?').run(templateId);
  const ins = db.prepare('INSERT INTO chore_template_assignments (template_id, member_id, position) VALUES (?, ?, ?)');
  memberIds.forEach((mid, i) => ins.run(templateId, mid, i));
}

/** Pin the rotation so that `memberId` is the scheduled player for the turn starting `anchorDateKey`. */
export function reanchor(db, templateId, memberId, anchorDateKey) {
  db.prepare('UPDATE chore_templates SET rotation_anchor_member = ?, rotation_anchor_date = ? WHERE id = ?')
    .run(memberId, anchorDateKey, templateId);
}

/** The player after `memberId` in `order` (wrapping), considering only ids in `keep`. */
export function successorOf(order, memberId, keep) {
  const i = order.indexOf(memberId);
  if (i < 0) return keep[0] ?? null;
  for (let step = 1; step <= order.length; step += 1) {
    const cand = order[(i + step) % order.length];
    if (keep.includes(cand)) return cand;
  }
  return null;
}

/**
 * Call BEFORE removing `memberId` from the family: for every rotating series they are
 * part of, re-anchor so the current turn does not change (if they are on duty right now,
 * the next person in order takes over for the rest of the turn).
 */
export function onMemberRemoved(db, memberId, date = new Date()) {
  const templates = db.prepare(
    `SELECT t.* FROM chore_templates t
       JOIN chore_template_assignments a ON a.template_id = t.id
      WHERE a.member_id = ? AND t.rotation_enabled = 1`
  ).all(memberId);
  for (const tpl of templates) {
    const cfg = rotationConfig(db, tpl);
    const remaining = cfg.order.filter((id) => id !== memberId);
    if (remaining.length === 0) continue;
    const turn = getRotationTurn(cfg, date);
    let keep = turn ? turn.scheduledMemberId : remaining[0];
    if (keep === memberId) keep = successorOf(cfg.order, memberId, remaining);
    reanchor(db, tpl.id, keep, turn ? turn.turnStart : toDateKey(date));
  }
}

/** API-shaped summary: who is on duty, who is next, and the next few turns. */
export function rotationSummary(db, tpl, date = new Date()) {
  if (!tpl.rotation_enabled) {
    return { enabled: false, everyWeeks: tpl.rotation_every_weeks || 1, startDow: tpl.rotation_start_dow ?? 0 };
  }
  const cfg = rotationConfig(db, tpl);
  const turn = getRotationTurn(cfg, date);
  const upcoming = getUpcomingTurns(cfg, date, 6).map((t) => ({
    memberId: t.memberId, scheduledMemberId: t.scheduledMemberId,
    turnStart: t.turnStart, turnEnd: t.turnEnd, overridden: t.overridden,
  }));
  return {
    enabled: true,
    everyWeeks: cfg.everyWeeks,
    startDow: cfg.startDow,
    anchorDate: cfg.anchorDate,
    anchorMember: cfg.anchorMember,
    onDuty: turn && {
      memberId: turn.memberId, scheduledMemberId: turn.scheduledMemberId, overridden: turn.overridden,
      turnStart: turn.turnStart, turnEnd: turn.turnEnd,
    },
    next: turn && { memberId: turn.nextMemberId, startsOn: turn.nextStart },
    upcoming,
    overrides: cfg.overrides,
  };
}

// Rotation settings from a request body, filling gaps from `base` (the stored values).
export function parseRotation(input, base = {}) {
  if (input === undefined) return undefined;
  const r = input || {};
  const num = (v, fallback) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
  return {
    enabled: r.enabled === undefined ? !!base.enabled : !!r.enabled,
    everyWeeks: Math.min(52, Math.max(1, Math.trunc(num(r.everyWeeks, base.everyWeeks ?? 1)))),
    startDow: Math.min(6, Math.max(0, Math.trunc(num(r.startDow, base.startDow ?? 0)))),
    firstMemberId: r.firstMemberId || null,
  };
}

// Apply rotation settings after the players have been saved. `before` is a snapshot
// taken before any change so the current turn can be kept stable across edits.
export function applyRotation(db, templateId, rot, before, today) {
  if (!rot.enabled) {
    db.prepare('UPDATE chore_templates SET rotation_enabled = 0 WHERE id = ?').run(templateId);
    return;
  }
  const order = templateOrder(db, templateId);
  db.prepare('UPDATE chore_templates SET rotation_enabled = 1, rotation_every_weeks = ?, rotation_start_dow = ? WHERE id = ?')
    .run(rot.everyWeeks, rot.startDow, templateId);

  const sameShape = before.enabled && before.every === rot.everyWeeks && before.dow === rot.startDow && before.turn;
  let keep;
  let anchorDate;
  if (sameShape) {
    // Same turn boundaries as before: keep the scheduled player and the turn's start,
    // so any swap/skip recorded for this turn still lines up.
    keep = before.turn.scheduledMemberId;
    anchorDate = before.turn.turnStart;
    if (!order.includes(keep)) keep = successorOf(before.order, keep, order);
  } else {
    const prior = before.enabled && before.turn ? before.turn.memberId : null;
    keep = (rot.firstMemberId && order.includes(rot.firstMemberId)) ? rot.firstMemberId
      : (prior && order.includes(prior) ? prior : order[0]);
    anchorDate = toDateKey(today);
  }
  reanchor(db, templateId, keep, anchorDate);
}
