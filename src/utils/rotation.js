// Client-side preview of a rotation, mirroring getRotationTurn in server/lib/recurrence.js.
// It is only used to show "who's next" in the quest form before saving; the server is the
// source of truth for who is actually on duty.

export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export function periodStart(date, startDow = 0) {
  const d = startOfDay(date)
  return addDays(d, -((d.getDay() - startDow + 7) % 7))
}

export function parseDateKey(key) {
  const [y, m, d] = String(key).split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateKey(key) {
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// The next `count` turns for a rotation that starts with `firstMemberId` on duty right now.
export function previewTurns({ order, firstMemberId, everyWeeks = 1, startDow = 0 }, count = 4, today = new Date()) {
  if (!order || order.length === 0) return []
  const every = Math.max(1, Number(everyWeeks) || 1)
  const first = Math.max(0, order.indexOf(firstMemberId))
  const start = periodStart(today, Number(startDow) || 0)
  return Array.from({ length: count }, (_, k) => {
    const turnStart = addDays(start, k * 7 * every)
    return {
      memberId: order[(first + k) % order.length],
      start: turnStart,
      end: addDays(turnStart, 7 * every - 1),
    }
  })
}
