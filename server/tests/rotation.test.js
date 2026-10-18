import test from 'node:test';
import assert from 'node:assert/strict';
import { getRotationTurn, getUpcomingTurns, periodStart } from '../lib/recurrence.js';

const D = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
// 2026-10-18 is a Sunday.
const cfg = { order: ['A', 'B', 'C'], anchorMember: 'A', anchorDate: '2026-10-18', everyWeeks: 1, startDow: 0, overrides: [] };
const who = (c, date) => getRotationTurn(c, D(date))?.memberId;

test('turns advance each Sunday and wrap around the order', () => {
  assert.equal(who(cfg, '2026-10-18'), 'A');
  assert.equal(who(cfg, '2026-10-24'), 'A'); // Saturday, same turn
  assert.equal(who(cfg, '2026-10-25'), 'B');
  assert.equal(who(cfg, '2026-11-01'), 'C');
  assert.equal(who(cfg, '2026-11-08'), 'A');
  assert.equal(who(cfg, '2026-11-15'), 'B');
});

test('no turn before the rotation begins, or with no players', () => {
  assert.equal(getRotationTurn(cfg, D('2026-10-10')), null);
  assert.equal(getRotationTurn({ ...cfg, order: [] }, D('2026-11-01')), null);
});

test('works across a year boundary', () => {
  assert.equal(who(cfg, '2026-12-27'), 'B');
  assert.equal(who(cfg, '2027-01-03'), 'C');
});

test('an anchor in mid-week aligns to the start of its week', () => {
  assert.equal(who({ ...cfg, anchorDate: '2026-10-21' }, '2026-10-18'), 'A');
});

test('the anchor member can be anywhere in the order', () => {
  assert.equal(who({ ...cfg, anchorMember: 'B' }, '2026-10-25'), 'C');
});

test('turns can last several weeks and start on any weekday', () => {
  const biweekly = { ...cfg, everyWeeks: 2 };
  assert.equal(who(biweekly, '2026-10-31'), 'A');
  assert.equal(who(biweekly, '2026-11-01'), 'B');
  const monday = { ...cfg, startDow: 1, anchorDate: '2026-10-19' };
  assert.equal(who(monday, '2026-10-25'), 'A'); // Sunday is still the previous turn
  assert.equal(who(monday, '2026-10-26'), 'B');
});

test('a swap changes only that turn', () => {
  const c = { ...cfg, overrides: [{ period_start: '2026-10-25', kind: 'swap', member_id: 'C' }] };
  assert.equal(who(c, '2026-10-25'), 'C');
  assert.equal(getRotationTurn(c, D('2026-10-25')).overridden, true);
  assert.equal(who(c, '2026-11-01'), 'C'); // scheduled, not owed
  assert.equal(who(c, '2026-11-08'), 'A');
});

test('a skip hands the turn to the next person and is not owed back', () => {
  const c = { ...cfg, overrides: [{ period_start: '2026-10-25', kind: 'skip' }] };
  assert.equal(who(c, '2026-10-25'), 'C');
  assert.equal(who(c, '2026-11-01'), 'C');
});

test('a swap to someone who is not in the rotation is ignored', () => {
  const c = { ...cfg, overrides: [{ period_start: '2026-10-25', kind: 'swap', member_id: 'ZZ' }] };
  assert.equal(who(c, '2026-10-25'), 'B');
});

test('upcoming turns, turn end and next start', () => {
  assert.deepEqual(
    getUpcomingTurns(cfg, D('2026-10-20'), 4).map((t) => `${t.memberId}@${t.turnStart}`),
    ['A@2026-10-18', 'B@2026-10-25', 'C@2026-11-01', 'A@2026-11-08'],
  );
  const t = getRotationTurn(cfg, D('2026-10-20'));
  assert.equal(t.turnEnd, '2026-10-24');
  assert.equal(t.nextStart, '2026-10-25');
  assert.equal(t.nextMemberId, 'B');
});

test('periodStart snaps back to the chosen weekday', () => {
  assert.equal(periodStart(D('2026-10-22'), 0).getDate(), 18);
  assert.equal(periodStart(D('2026-10-22'), 3).getDate(), 21);
});
