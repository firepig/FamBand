/**
 * Recurrence helpers — pure functions, no DB.
 *
 * A template has:
 *   frequency: 'once' | 'daily' | 'weekdays' | 'weekly' | 'custom'
 *   days_of_week: CSV "0,1,3" (Sun=0..Sat=6) — used by weekly/custom
 *   interval: every N (default 1) — applies to daily/weekly
 *   start_date / end_date: 'YYYY-MM-DD' bounds (nullable, end exclusive? no — inclusive)
 *
 * Dates flow as 'YYYY-MM-DD' strings; we never use Date constructors that
 * touch UTC midnight ambiguity (timezone bug we already fixed elsewhere).
 */

// Normalize a days-of-week input (array or CSV) into a clean "0,1,3" string.
export function normalizeDays(input) {
  if (input == null) return '';
  if (Array.isArray(input)) {
    return input.map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      .join(',');
  }
  return String(input);
}

export function parseDateKey(str) {
  if (!str) return null;
  const s = String(str).split('T')[0];
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function daysBetween(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  // strip time
  const ax = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bx = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bx - ax) / MS);
}

function parseDaysOfWeek(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/**
 * Return array of YYYY-MM-DD strings the template should occur on,
 * within [windowStart, windowEnd] inclusive.
 *
 * Returns [] for inactive templates or 'once' (those don't auto-materialize
 * beyond their start_date occurrence — handled separately if at all).
 */
export function getOccurrences(template, windowStart, windowEnd) {
  if (!template || !template.active) return [];
  const freq = template.frequency;
  if (freq === 'once') return []; // one-off chores aren't materialized by template

  const interval = Math.max(1, Number(template.interval) || 1);
  const startBound = parseDateKey(template.start_date) || windowStart;
  const endBound = parseDateKey(template.end_date); // nullable

  // Clamp scan window to template bounds
  const scanStart = startBound > windowStart ? startBound : windowStart;
  const scanEnd = endBound && endBound < windowEnd ? endBound : windowEnd;
  if (scanStart > scanEnd) return [];

  const out = [];

  if (freq === 'daily') {
    // Every `interval` days, anchored on startBound
    const offsetFromAnchor = daysBetween(startBound, scanStart);
    // Move forward to the next aligned date
    let skip = ((interval - (offsetFromAnchor % interval)) % interval);
    let cur = addDays(scanStart, skip);
    while (cur <= scanEnd) {
      out.push(toDateKey(cur));
      cur = addDays(cur, interval);
    }
    return out;
  }

  if (freq === 'weekdays') {
    let cur = new Date(scanStart);
    while (cur <= scanEnd) {
      const dow = cur.getDay();
      if (dow >= 1 && dow <= 5) out.push(toDateKey(cur));
      cur = addDays(cur, 1);
    }
    return out;
  }

  if (freq === 'weekly' || freq === 'custom') {
    const dows = parseDaysOfWeek(template.days_of_week);
    if (dows.length === 0) return [];
    // For weekly with interval>1: anchor on the week of startBound (Sunday).
    const anchorSun = (() => {
      const a = new Date(startBound);
      a.setDate(a.getDate() - a.getDay());
      return a;
    })();
    let cur = new Date(scanStart);
    while (cur <= scanEnd) {
      const dow = cur.getDay();
      if (dows.includes(dow)) {
        // Check weekly interval alignment
        const weekIndex = Math.floor(daysBetween(anchorSun, cur) / 7);
        if (weekIndex % interval === 0) {
          out.push(toDateKey(cur));
        }
      }
      cur = addDays(cur, 1);
    }
    return out;
  }

  return [];
}

/** Convenience: today (local) as YYYY-MM-DD */
export function todayKey() {
  return toDateKey(new Date());
}
