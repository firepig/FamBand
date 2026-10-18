import { useContext, useMemo, useState } from 'react';
import { Card, Badge } from 'react-bootstrap';
import { FaCheck, FaTimes, FaHistory } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import Avatar from '../common/Avatar';

function parseLocalDate(value) {
  if (!value) return null;
  const s = String(value).split('T')[0];
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmtDate(value) {
  const d = parseLocalDate(value);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FILTERS = [
  { key: 'all',    label: 'ALL' },
  { key: 'done',   label: 'DONE' },
  { key: 'failed', label: 'FAILED' },
];

export default function History() {
  const { chores, members } = useContext(AppContext);
  const [filter, setFilter] = useState('all');

  const items = useMemo(() => {
    const list = (chores || [])
      .filter((c) => c.status === 'done' || c.status === 'failed')
      .filter((c) => filter === 'all' || c.status === filter)
      .slice() // copy
      .sort((a, b) => {
        // Prefer occurrence_date, fall back to created_at
        const da = a.occurrence_date || a.due_date || a.createdAt || '';
        const db = b.occurrence_date || b.due_date || b.createdAt || '';
        return db.localeCompare(da);
      })
      .slice(0, 40);
    return list;
  }, [chores, filter]);

  const lookupMember = (id) => members.find((m) => m.id === id);

  return (
    <Card>
      <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <span className="d-flex align-items-center gap-2">
          <FaHistory /> RECENT QUEST LOG
        </span>
        <div className="d-flex gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontFamily: 'var(--rt-font-display)',
                  fontSize: '0.55rem',
                  border: `2px solid ${active ? 'var(--rt-accent)' : 'var(--rt-border)'}`,
                  background: active ? 'var(--rt-accent)' : 'transparent',
                  color: active ? 'var(--rt-border-dark)' : 'var(--rt-ink)',
                  letterSpacing: 1,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </Card.Header>
      <Card.Body style={{ maxHeight: 360, overflowY: 'auto', padding: 0 }}>
        {items.length === 0 ? (
          <div className="text-center py-4" style={{ color: 'var(--rt-ink-dim)' }}>
            <FaHistory size={32} style={{ opacity: 0.4 }} className="mb-2" />
            <p className="mb-0">No quest history yet.</p>
          </div>
        ) : (
          <div className="d-flex flex-column">
            {items.map((c) => {
              const isFail = c.status === 'failed';
              const assignments = c.assignments || c.assignedTo || [];
              const memberIds = assignments.map((a) => (typeof a === 'object' ? a.id : a));
              const memberObjs = memberIds.map(lookupMember).filter(Boolean);
              const when = c.occurrence_date || c.due_date || c.createdAt;
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--rt-bg-3)',
                    opacity: isFail ? 0.85 : 1,
                  }}
                >
                  <span style={{
                    width: 24, height: 24,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: isFail ? 'var(--rt-danger)' : 'var(--rt-success)',
                    color: 'var(--rt-border-dark)',
                    flexShrink: 0,
                  }}>
                    {isFail ? <FaTimes size={12} /> : <FaCheck size={12} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--rt-font-display)',
                      fontSize: '0.7rem',
                      color: 'var(--rt-ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {c.title}
                    </div>
                    <div style={{
                      fontFamily: 'var(--rt-font-body)',
                      fontSize: '0.85rem',
                      color: 'var(--rt-ink-dim)',
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      marginTop: 2,
                    }}>
                      <span>{fmtDate(when)}</span>
                      {memberObjs.slice(0, 3).map((m) => (
                        <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: '0.9rem' }}><Avatar avatar={m.avatar} /></span>
                          <span>{m.name}</span>
                        </span>
                      ))}
                      {memberObjs.length > 3 && <span>+{memberObjs.length - 3}</span>}
                    </div>
                  </div>
                  {isFail ? (
                    <Badge bg="danger">FAILED</Badge>
                  ) : (
                    <Badge bg="success">+{c.points}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
