import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { Spinner } from 'react-bootstrap';
import { FaStar, FaCrown } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchPoints } from '../../api';
import Avatar from '../common/Avatar';

const LEVEL_BASE = 100;
const getLevel = (p) => Math.floor(p / LEVEL_BASE) + 1;

function parseLocalDate(value) {
  if (!value) return null;
  const str = String(value).split('T')[0];
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function isToday(value) {
  const d = parseLocalDate(value);
  if (!d) return false;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return d.getTime() === t.getTime();
}
function getAssigneeIds(chore) {
  return (chore.assignments || chore.assignedTo || []).map((a) => (typeof a === 'object' ? a.id : a));
}

export default function PointsBar() {
  const { members, chores, stats, loading, switchMember } = useContext(AppContext);

  // Daily progress: chores due today (or any todo/in_progress with no due) per member
  const dailyProgress = useMemo(() => {
    const map = {};
    members.forEach((m) => { map[m.id] = { done: 0, total: 0 }; });
    (chores || []).forEach((chore) => {
      if (chore.status === 'failed') return;
      const due = chore.dueDate || chore.due_date;
      if (!due || !isToday(due)) return;
      const ids = getAssigneeIds(chore);
      ids.forEach((id) => {
        if (!map[id]) return;
        map[id].total += 1;
        if (chore.status === 'done') map[id].done += 1;
      });
    });
    return map;
  }, [chores, members]);
  const [pointsMap, setPointsMap] = useState({});
  const [loadingPoints, setLoadingPoints] = useState(true);

  const loadAllPoints = useCallback(async () => {
    setLoadingPoints(true);
    const map = {};
    const results = await Promise.all(
      members.map((m) =>
        fetchPoints(m.id).then((d) => ({ id: m.id, balance: d.balance ?? 0 })).catch(() => ({ id: m.id, balance: 0 }))
      )
    );
    results.forEach((r) => { map[r.id] = r.balance; });
    setPointsMap(map);
    setLoadingPoints(false);
  }, [members]);

  useEffect(() => {
    if (members.length > 0) loadAllPoints();
  }, [loadAllPoints, members.length]);

  useEffect(() => { if (stats) loadAllPoints(); }, [stats]); // eslint-disable-line

  if (loading || members.length === 0) return null;

  // Compact horizontal strip — kids first, then parents
  const ordered = [...members].sort((a, b) => {
    if (a.role === b.role) return 0;
    return a.role === 'child' ? -1 : 1;
  });

  return (
    <div
      className="d-flex flex-wrap align-items-center gap-2 mb-3"
      style={{
        padding: '6px 8px',
        background: 'var(--rt-bg-2)',
        border: '2px solid var(--rt-border)',
        boxShadow: '3px 3px 0 0 var(--rt-border-dark)',
      }}
      title="Click a player to switch"
    >
      {loadingPoints && <Spinner animation="border" size="sm" variant="warning" />}
      {ordered.map((m) => {
        const pts = pointsMap[m.id] ?? 0;
        const isParent = m.role === 'parent';
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => switchMember(m.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              columnGap: 8,
              padding: '4px 10px',
              minWidth: 200,
              border: `2px solid ${isParent ? 'var(--rt-ink-muted)' : (m.color || 'var(--rt-accent)')}`,
              background: 'var(--rt-panel)',
              fontFamily: 'var(--rt-font-display)',
              fontSize: '0.6rem',
              lineHeight: 1,
              color: 'var(--rt-ink)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rt-bg-3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--rt-panel)'; }}
          >
            <span style={{ fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar avatar={m.avatar} />
              <span style={{ fontSize: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {m.name}
                {isParent && <FaCrown size={9} style={{ color: 'var(--rt-accent)' }} />}
              </span>
            </span>

            {(() => {
              const dp = dailyProgress[m.id] || { done: 0, total: 0 };
              const pct = dp.total === 0 ? 0 : (dp.done / dp.total) * 100;
              const complete = dp.total > 0 && dp.done === dp.total;
              return (
                <span
                  title={dp.total === 0 ? 'No chores today' : `Today: ${dp.done}/${dp.total} (${Math.round(pct)}%)`}
                  style={{
                    position: 'relative',
                    height: 10,
                    background: 'var(--rt-bg-3)',
                    border: '1px solid var(--rt-border-dark)',
                    boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.4)',
                    minWidth: 60,
                    opacity: dp.total === 0 ? 0.4 : 1,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${pct}%`,
                      background: complete ? 'var(--rt-success)' : 'var(--rt-accent)',
                      transition: 'width 0.2s steps(8)',
                    }}
                  />
                  {[20, 40, 60, 80].map((t) => (
                    <span key={t} style={{
                      position: 'absolute', top: 0, bottom: 0, left: `${t}%`,
                      width: 1, background: 'var(--rt-border-dark)', opacity: 0.6,
                    }} />
                  ))}
                </span>
              );
            })()}

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifySelf: 'end' }}>
              <span style={{ color: 'var(--rt-accent)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <FaStar size={9} /> {pts}
              </span>
              {(() => {
                const dp = dailyProgress[m.id] || { done: 0, total: 0 };
                if (dp.total === 0) return null;
                return (
                  <span style={{ color: 'var(--rt-ink-dim)', fontSize: '0.55rem' }}>
                    {dp.done}/{dp.total}
                  </span>
                );
              })()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
