import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Badge, Spinner, Alert } from 'react-bootstrap';
import { FaMoneyBillWave, FaMinus, FaPlus, FaCheck } from 'react-icons/fa';
import { cashOut, fetchCashOuts, markCashOutPaid } from '../../api';

// Exchange rate: 70 points = $5.00, in whole $5.00 blocks (mirrors server/lib/cash.js).
export const POINTS_PER_BLOCK = 70;
export const CENTS_PER_BLOCK = 500;
const MAX_BLOCKS = 20;

export const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function CashOutPanel({ points, onDone }) {
  const [blocks, setBlocks] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const maxBlocks = Math.min(MAX_BLOCKS, Math.floor(points / POINTS_PER_BLOCK));
  const chosen = Math.max(1, Math.min(blocks, Math.max(maxBlocks, 1)));
  const cost = chosen * POINTS_PER_BLOCK;
  const canCash = maxBlocks >= 1;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await cashOut(chosen);
      setConfirm(false);
      setBlocks(1);
      window.dispatchEvent(new Event('points-changed'));
      onDone?.(res.balance, `Cashed out ${money(res.cents)}! Ask a parent for your cash.`);
    } catch (err) {
      setError(err.message || 'Could not cash out');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="shadow-sm mb-3" style={{ border: '2px solid #198754' }}>
        <Card.Body className="d-flex flex-wrap align-items-center gap-3">
          <div style={{ fontSize: '3rem', lineHeight: 1 }}>💵</div>
          <div className="flex-grow-1" style={{ minWidth: 180 }}>
            <div className="fw-bold">Cash out for allowance</div>
            <div className="text-muted small">
              {POINTS_PER_BLOCK} points = {money(CENTS_PER_BLOCK)}. You have {points} points
              {canCash ? ` (up to ${money(maxBlocks * CENTS_PER_BLOCK)}).` : `, so you need ${POINTS_PER_BLOCK - points} more for your first ${money(CENTS_PER_BLOCK)}.`}
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Button variant="outline-secondary" size="sm" disabled={!canCash || chosen <= 1}
              onClick={() => setBlocks(chosen - 1)} aria-label="Less cash"><FaMinus /></Button>
            <div className="text-center" style={{ minWidth: 90 }}>
              <div className="fw-bold fs-5">{money(chosen * CENTS_PER_BLOCK)}</div>
              <div className="small text-muted">{cost} pts</div>
            </div>
            <Button variant="outline-secondary" size="sm" disabled={!canCash || chosen >= maxBlocks}
              onClick={() => setBlocks(chosen + 1)} aria-label="More cash"><FaPlus /></Button>
          </div>
          <Button variant={canCash ? 'success' : 'secondary'} disabled={!canCash}
            onClick={() => { setError(''); setConfirm(true); }}>
            <FaMoneyBillWave className="me-1" />Cash out
          </Button>
        </Card.Body>
      </Card>

      <Modal show={confirm} onHide={() => !busy && setConfirm(false)} centered size="sm">
        <Modal.Header closeButton={!busy}>
          <Modal.Title className="fw-bold fs-6">Confirm cash out</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          <div style={{ fontSize: '3rem' }}>💵</div>
          <p className="fw-bold mt-2 mb-1">Turn {cost} points into {money(chosen * CENTS_PER_BLOCK)}?</p>
          <p className="text-muted small mb-0">
            You will have <strong>{points - cost}</strong> points left. A parent will hand you the cash.
          </p>
          {error && <Alert variant="danger" className="py-2 small mt-2 mb-0">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-center">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="success" size="sm" disabled={busy} onClick={submit}>
            {busy ? <Spinner animation="border" size="sm" /> : 'Cash out'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export function CashLedger({ isParent, onPaid }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchCashOuts();
      setRows(data.cashOuts);
    } catch (err) {
      setError(err.message || 'Could not load cash-outs');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (row) => {
    try {
      await markCashOutPaid(row.id);
      await load();
      onPaid?.();
    } catch (err) {
      setError(err.message || 'Could not mark paid');
    }
  };

  if (rows === null) {
    return <div className="text-center py-4"><Spinner animation="border" size="sm" variant="warning" /></div>;
  }

  const owedCents = rows.filter((r) => r.status === 'owed').reduce((sum, r) => sum + r.cents, 0);

  return (
    <>
      {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
      {owedCents > 0 && (
        <Alert variant="warning" className="py-2">
          {isParent ? 'Cash owed to the kids' : 'Cash waiting for you'}: <strong>{money(owedCents)}</strong>
        </Alert>
      )}
      {rows.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <FaMoneyBillWave size={48} className="mb-3 opacity-50" />
          <p className="fw-semibold mb-1">No cash-outs yet</p>
          <p className="small mb-0">{POINTS_PER_BLOCK} points = {money(CENTS_PER_BLOCK)}. Cash out from the Shop tab.</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {rows.map((r) => (
            <div key={r.id} className="d-flex align-items-center gap-3 p-3 rounded-3"
              style={{ backgroundColor: '#f8f9fa', border: '1px solid #eee' }}>
              <span style={{ fontSize: '2rem' }}>💵</span>
              <div className="flex-grow-1">
                <div className="fw-semibold">
                  {money(r.cents)}{isParent && <span className="text-muted fw-normal"> · {r.member_name || 'Former member'}</span>}
                </div>
                <small className="text-muted">
                  {r.points} points · {new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </small>
              </div>
              {r.status === 'paid' ? (
                <Badge bg="success"><FaCheck className="me-1" />PAID</Badge>
              ) : isParent ? (
                <Button size="sm" variant="success" onClick={() => markPaid(r)}>Mark paid</Button>
              ) : (
                <Badge bg="warning" text="dark">WAITING</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
