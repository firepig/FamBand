import { useState, useEffect, useContext, useCallback } from 'react';
import { Card, Button, Form, Spinner, Alert } from 'react-bootstrap';
import { FaGift } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { transferPoints, fetchTransfers } from '../../api';
import Avatar from '../common/Avatar';

export default function GiftPoints({ points, onSent }) {
  const { members, currentMember, isParent } = useContext(AppContext);
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState(null);

  const others = (members || []).filter((m) => m.id !== currentMember?.id);
  const target = others.find((m) => m.id === toId);
  const qty = parseInt(amount, 10);
  const valid = !!target && Number.isInteger(qty) && qty >= 1 && qty <= points;

  const load = useCallback(async () => {
    try { setLog(await fetchTransfers()); } catch { setLog([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      const res = await transferPoints(toId, qty, note.trim());
      window.dispatchEvent(new Event('points-changed'));
      onSent?.(res.balance, `Sent ${qty} points to ${target.name}!`);
      setAmount('');
      setNote('');
      load();
    } catch (err) {
      setError(err.message || 'Could not send points');
    } finally {
      setBusy(false);
    }
  };

  const who = (name, avatar) => (
    <span className="d-inline-flex align-items-center gap-1">
      <Avatar avatar={avatar} size="1.4em" />{name || 'Former member'}
    </span>
  );

  return (
    <>
      <Card className="shadow-sm mb-3" style={{ border: '2px solid #6f42c1' }}>
        <Card.Body>
          <div className="fw-bold mb-1"><FaGift className="me-1" />Gift points</div>
          <div className="text-muted small mb-3">
            Send some of your points to someone in the family. You have <strong>{points}</strong>. Gifts are instant and can't be undone.
          </div>
          <Form onSubmit={send}>
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <Form.Group style={{ minWidth: 160, flex: '1 1 160px' }}>
                <Form.Label className="small mb-1">To</Form.Label>
                <Form.Select value={toId} onChange={(e) => setToId(e.target.value)} disabled={busy}>
                  <option value="">Choose...</option>
                  {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group style={{ width: 110 }}>
                <Form.Label className="small mb-1">Points</Form.Label>
                <Form.Control type="number" min={1} max={points} value={amount}
                  onChange={(e) => setAmount(e.target.value)} disabled={busy} />
              </Form.Group>
              <Form.Group style={{ minWidth: 160, flex: '2 1 200px' }}>
                <Form.Label className="small mb-1">Message (optional)</Form.Label>
                <Form.Control type="text" maxLength={100} value={note}
                  onChange={(e) => setNote(e.target.value)} disabled={busy} placeholder="Thanks for helping!" />
              </Form.Group>
              <Button type="submit" variant="primary" disabled={!valid || busy}>
                {busy ? <Spinner animation="border" size="sm" /> : 'Send'}
              </Button>
            </div>
            {qty > points && <div className="text-danger small mt-2">You only have {points} points.</div>}
            {error && <Alert variant="danger" className="py-2 small mt-2 mb-0">{error}</Alert>}
          </Form>
        </Card.Body>
      </Card>

      {log === null ? (
        <div className="text-center py-3"><Spinner animation="border" size="sm" variant="warning" /></div>
      ) : log.length === 0 ? (
        <div className="text-center py-4 text-muted">
          <FaGift size={40} className="mb-2 opacity-50" />
          <p className="mb-0">No gifts yet.</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          <div className="small text-muted">{isParent ? 'All gifts in the family' : 'Your gifts'}</div>
          {log.map((t) => (
            <div key={t.id} className="p-3 rounded-3" style={{ backgroundColor: '#f8f9fa', border: '1px solid #eee' }}>
              <div className="d-flex flex-wrap align-items-center gap-2">
                {who(t.from_name, t.from_avatar)}
                <span className="text-muted">sent</span>
                <strong>{t.amount} pts</strong>
                <span className="text-muted">to</span>
                {who(t.to_name, t.to_avatar)}
                <small className="text-muted ms-auto">
                  {new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </small>
              </div>
              {t.note && <div className="small text-muted mt-1">“{t.note}”</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
