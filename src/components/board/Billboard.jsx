import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Spinner } from 'react-bootstrap';
import { FaStar, FaClock, FaSyncAlt, FaHandPaper, FaCheck, FaExpand, FaUserFriends } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchChores } from '../../api';
import Avatar from '../common/Avatar';

const COLUMNS = [
  { status: 'todo',        title: 'TO DO',       cls: 'rt-column--todo' },
  { status: 'in_progress', title: 'IN PROGRESS', cls: 'rt-column--in_progress' },
  { status: 'done',        title: 'DONE',        cls: 'rt-column--done' },
];

const REFRESH_MS = 30 * 1000;
const DONE_LIMIT = 12;

const CATEGORY_COLORS = {
  Chore:    'var(--rt-cat-chore)',
  Homework: 'var(--rt-cat-homework)',
  Outdoor:  'var(--rt-cat-outdoor)',
  Kitchen:  'var(--rt-cat-kitchen)',
  Other:    'var(--rt-cat-other)',
};

function parseLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split('T')[0].split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

function BillboardCard({ chore }) {
  const people = chore.assignments || [];
  const items = chore.checklist || [];
  const doneItems = items.filter((i) => i.completed).length;
  const due = parseLocalDate(chore.due_date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = due && due < today && chore.status !== 'done';
  const approved = !!chore.points_approved;

  return (
    <div
      className={`rt-chore ${chore.status === 'done' ? 'rt-chore--done' : ''}`}
      style={{ borderLeft: `6px solid ${CATEGORY_COLORS[chore.category] || CATEGORY_COLORS.Other}` }}
    >
      <div className="d-flex justify-content-between align-items-start gap-2">
        <span className="rt-chore__title" style={{ flex: 1 }}>{chore.title}</span>
        <span className="rt-chore__points"><FaStar size={11} />{chore.points}</span>
      </div>

      <div className="rt-chore__meta">
        {people.map((m) => (
          <span key={m.id} className="d-inline-flex align-items-end gap-1">
            <span className="rt-chore__avatar"><Avatar avatar={m.avatar} size="100%" /></span>
            <span className="rt-billboard__name">{m.name}</span>
          </span>
        ))}
        {people.length === 0 && chore.status !== 'done' && (
          <span className="rt-chore__cat" style={{ background: 'var(--rt-accent)' }}>
            <FaHandPaper size={10} style={{ marginRight: 3 }} />UP FOR GRABS
          </span>
        )}
        {chore.category && (
          <span className="rt-chore__cat" style={{ background: CATEGORY_COLORS[chore.category] || CATEGORY_COLORS.Other }}>
            {chore.category}
          </span>
        )}
        {chore.template_id && (
          <span className="rt-chore__cat" style={{ background: 'var(--rt-secondary)' }}>
            <FaSyncAlt size={9} style={{ marginRight: 3 }} />{chore.rotation ? 'ROTATES' : 'REPEAT'}
          </span>
        )}
        {items.length > 0 && <span><FaCheck size={11} /> {doneItems}/{items.length}</span>}
        {due && (
          <span style={{ color: overdue ? 'var(--rt-danger)' : 'var(--rt-ink-dim)' }}>
            <FaClock size={11} /> {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {chore.status === 'done' && (
          <span className="rt-chore__cat" style={{ background: approved ? 'var(--rt-success)' : 'var(--rt-warning)' }}>
            {approved ? 'APPROVED' : 'PENDING'}
          </span>
        )}
      </div>

      {chore.rotation?.next && chore.status !== 'done' && (
        <div className="rt-billboard__next">Next up: {chore.rotation.next.name}</div>
      )}
    </div>
  );
}

// A read-only wall display of the whole board. It belongs to the family sign-in, not to
// any player, so nobody can change a quest from here: pick a player (and enter their PIN)
// to act on a quest.
export default function Billboard() {
  const { family, currentMember } = useContext(AppContext);
  const navigate = useNavigate();
  const [chores, setChores] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      setChores(await fetchChores());
      setError('');
    } catch (err) {
      setError(err?.status === 401 ? 'Signed out. Sign in again to keep the board up to date.' : 'Can\'t reach the server. Retrying...');
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(new Date()), 15 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Keep the screen on while the billboard is showing (not every browser supports this).
  useEffect(() => {
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (!cancelled && document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen');
      } catch { /* ignore: unsupported or denied */ }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release?.().catch(() => {});
    };
  }, []);

  const columns = useMemo(() => {
    const map = { todo: [], in_progress: [], done: [] };
    (chores || []).forEach((c) => { if (map[c.status]) map[c.status].push(c); });
    return map;
  }, [chores]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="rt-billboard px-3 py-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h1 className="rt-page-title mb-1">{(family?.name || 'FAMBAND').toUpperCase()} QUEST BOARD</h1>
          <div className="rt-billboard__clock">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
        <div className="d-flex gap-2 rt-billboard__controls">
          <Button variant="outline-secondary" size="sm" onClick={toggleFullscreen}><FaExpand className="me-1" />Fullscreen</Button>
          <Button variant="warning" size="sm" onClick={() => navigate(currentMember ? '/' : '/select-member')}>
            <FaUserFriends className="me-1" />{currentMember ? 'Back to my board' : 'Switch to a player'}
          </Button>
        </div>
      </div>

      {error && <div className="alert alert-warning py-2">{error}</div>}

      {chores === null ? (
        <div className="text-center py-5"><Spinner animation="border" variant="warning" /></div>
      ) : (
        <div className="rt-billboard__grid">
          {COLUMNS.map((col) => {
            const list = columns[col.status];
            const shown = col.status === 'done' ? list.slice(0, DONE_LIMIT) : list;
            return (
              <div key={col.status} className={`rt-column ${col.cls}`}>
                <div className="rt-column__title mb-2">
                  {col.title}<span className="rt-column__count">{list.length}</span>
                </div>
                <div className="d-flex flex-column gap-2">
                  {shown.length === 0 && <div className="rt-column__empty">~ no quests ~</div>}
                  {shown.map((c) => <BillboardCard key={c.id} chore={c} />)}
                  {list.length > shown.length && (
                    <div className="rt-column__empty">+ {list.length - shown.length} earlier</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
