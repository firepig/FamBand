import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import {
  Card, Row, Col, Badge, Button, Modal, Form, Spinner, Table, FormCheck,
} from 'react-bootstrap';
import { FaBook, FaCheck, FaTimes, FaPlus, FaCalendarAlt, FaStar } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchHomework, createHomework, updateHomework } from '../../api';
import Avatar from '../common/Avatar';
import { avatarText } from '../../utils/images';

const SUBJECT_COLORS = {
  Math:    'var(--rt-primary)',
  Reading: 'var(--rt-success)',
  Science: 'var(--rt-secondary)',
  Writing: 'var(--rt-accent-2)',
  Other:   'var(--rt-ink-muted)',
};
const SUBJECTS = ['Math', 'Reading', 'Science', 'Writing', 'Other'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseLocalDate(value) {
  if (!value) return null;
  const str = String(value).split('T')[0];
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function getWeekDays() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth()    === d2.getMonth() &&
         d1.getDate()     === d2.getDate();
}

function isOverdue(value) {
  const due = parseLocalDate(value);
  if (!due) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return due < today;
}

export default function HomeworkChart() {
  const { members, notify } = useContext(AppContext);
  const [homeworkItems, setHomeworkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [dayModalDate, setDayModalDate] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [formMember, setFormMember] = useState('');
  const [formSubject, setFormSubject] = useState('Math');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState('');

  const weekDays = useMemo(() => getWeekDays(), []);
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const loadHomework = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHomework();
      setHomeworkItems(data);
    } catch {
      setHomeworkItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHomework(); }, [loadHomework]);

  const children = useMemo(() => members.filter((m) => m.role === 'child'), [members]);

  // Group homework by child for today
  const todaysHomework = useMemo(() => {
    const groups = {};
    children.forEach((c) => { groups[c.id] = { member: c, items: [] }; });
    homeworkItems.forEach((item) => {
      const dueRaw = item.due_date || item.dueDate;
      const due = parseLocalDate(dueRaw);
      if (!due || !isSameDay(due, today)) return;
      const memberId = item.member_id || item.memberId;
      if (groups[memberId]) groups[memberId].items.push(item);
    });
    return Object.values(groups).filter((g) => g.items.length > 0);
  }, [homeworkItems, children, today]);

  const weeklyData = useMemo(() => {
    const data = {};
    children.forEach((c) => {
      data[c.id] = {};
      weekDays.forEach((d) => { data[c.id][formatDateKey(d)] = { day: d, items: [] }; });
    });
    homeworkItems.forEach((item) => {
      const due = parseLocalDate(item.due_date || item.dueDate);
      if (!due) return;
      const key = formatDateKey(due);
      const memberId = item.member_id || item.memberId;
      if (data[memberId]?.[key]) data[memberId][key].items.push(item);
    });
    return data;
  }, [homeworkItems, children, weekDays]);

  const weeklyStats = useMemo(() => {
    const inWeek = homeworkItems.filter((item) => {
      const due = parseLocalDate(item.due_date || item.dueDate);
      return due && weekDays.some((wd) => isSameDay(wd, due));
    });
    return {
      assigned: inWeek.length,
      completed: inWeek.filter((i) => i.completed).length,
      overdue: inWeek.filter((i) => !i.completed && isOverdue(i.due_date || i.dueDate)).length,
    };
  }, [homeworkItems, weekDays]);

  const handleToggle = async (item) => {
    const newCompleted = !item.completed;
    try {
      await updateHomework(item.id, { completed: newCompleted });
      setHomeworkItems((prev) => prev.map((h) => h.id === item.id ? { ...h, completed: newCompleted } : h));
      if (newCompleted) notify?.('Homework done!', 'success');
    } catch (err) {
      notify?.(err.message || 'Update failed', 'error');
      loadHomework();
    }
  };

  const handleAdd = async () => {
    if (!formMember) { notify?.('Choose a child first', 'error'); return; }
    if (!formSubject) return;
    setSubmitting(true);
    try {
      await createHomework({
        memberId: formMember,
        subject: formSubject,
        description: formDescription,
        dueDate: formDueDate || null,
      });
      notify?.('Homework added!', 'success');
      setShowAddModal(false);
      setShowDayModal(false);
      resetForm();
      await loadHomework();
    } catch (err) {
      notify?.(err.message || 'Could not add homework', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormMember(children.length > 0 ? children[0].id : '');
    setFormSubject('Math');
    setFormDescription('');
    setFormDueDate('');
  };

  const openAdd = () => { resetForm(); setShowAddModal(true); };
  const openDay = (memberId, date) => {
    setDayModalDate(date);
    setFormMember(memberId);
    setFormSubject('Math');
    setFormDescription('');
    setFormDueDate(formatDateKey(date));
    setShowDayModal(true);
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="warning" />
        <p className="mt-3 rt-blink" style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.8rem' }}>LOADING...</p>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <>
        <h1 className="rt-page-title">HOMEWORK</h1>
        <Card><Card.Body className="text-center py-4">
          <FaBook size={40} className="mb-2" style={{ color: 'var(--rt-ink-dim)' }} />
          <p style={{ color: 'var(--rt-ink-dim)' }}>No children yet. Add some to track homework!</p>
        </Card.Body></Card>
      </>
    );
  }

  return (
    <>
      <h1 className="rt-page-title">HOMEWORK</h1>
      <Row className="g-3">
        <Col xs={12}>
          <Card>
            <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <span className="d-flex align-items-center gap-2">
                <FaBook /> TODAY'S MISSIONS
                <Badge bg="warning">
                  {today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Badge>
              </span>
              <Button variant="success" size="sm" onClick={openAdd}>
                <FaPlus className="me-1" /> ADD
              </Button>
            </Card.Header>
            <Card.Body>
              {todaysHomework.length === 0 ? (
                <div className="text-center py-3" style={{ color: 'var(--rt-ink-dim)' }}>
                  <FaStar size={32} className="mb-2 opacity-50" />
                  <p className="mb-0">All clear today! 🎉</p>
                </div>
              ) : (
                <Row className="g-3">
                  {todaysHomework.map((group) => (
                    <Col xs={12} md={6} lg={4} key={group.member.id}>
                      <div style={{
                        background: 'var(--rt-bg-3)',
                        border: '3px solid var(--rt-border)',
                        borderLeft: `6px solid ${group.member.color || 'var(--rt-accent)'}`,
                        padding: 12,
                      }}>
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <span style={{ fontSize: '1.6rem' }}><Avatar avatar={group.member.avatar} /></span>
                          <span style={{
                            fontFamily: 'var(--rt-font-display)',
                            fontSize: '0.75rem',
                            color: 'var(--rt-accent)',
                          }}>
                            {group.member.name.toUpperCase()}
                          </span>
                        </div>
                        <div className="d-flex flex-column gap-2">
                          {group.items.map((item) => {
                            const subjectColor = SUBJECT_COLORS[item.subject] || SUBJECT_COLORS.Other;
                            const dueRaw = item.due_date || item.dueDate;
                            const overdue = !item.completed && isOverdue(dueRaw);
                            return (
                              <div key={item.id} style={{
                                background: 'var(--rt-panel)',
                                border: '2px solid var(--rt-border)',
                                padding: '6px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                opacity: item.completed ? 0.6 : 1,
                              }}>
                                <FormCheck
                                  type="checkbox"
                                  checked={!!item.completed}
                                  onChange={() => handleToggle(item)}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{
                                    fontSize: '0.95rem',
                                    textDecoration: item.completed ? 'line-through' : 'none',
                                  }}>
                                    {item.description || item.subject}
                                  </div>
                                  <div className="d-flex gap-1 mt-1">
                                    <span style={{
                                      background: subjectColor,
                                      color: '#0a0918',
                                      fontFamily: 'var(--rt-font-display)',
                                      fontSize: '0.5rem',
                                      padding: '2px 4px',
                                      border: '1px solid #0a0918',
                                    }}>
                                      {item.subject}
                                    </span>
                                    {overdue && <Badge bg="danger">LATE</Badge>}
                                    {item.completed && <Badge bg="success">DONE</Badge>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12}>
          <Card>
            <Card.Header className="d-flex align-items-center gap-2">
              <FaCalendarAlt /> WEEKLY OVERVIEW
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive">
                <Table className="mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Child</th>
                      {weekDays.map((day, idx) => (
                        <th key={idx} className={isSameDay(day, today) ? 'table-warning' : ''}>
                          <div>{DAYS[idx]}</div>
                          <small>{day.getDate()}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {children.map((child) => (
                      <tr key={child.id}>
                        <td>
                          <div className="d-flex align-items-center gap-1 justify-content-center">
                            <span><Avatar avatar={child.avatar} /></span>
                            <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.65rem', color: child.color || 'var(--rt-accent)' }}>
                              {child.name}
                            </span>
                          </div>
                        </td>
                        {weekDays.map((day, idx) => {
                          const items = weeklyData[child.id]?.[formatDateKey(day)]?.items || [];
                          const done = items.filter((i) => i.completed).length;
                          const late = items.filter((i) => !i.completed && isOverdue(i.due_date || i.dueDate)).length;
                          const open = items.length - done - late;
                          const isToday = isSameDay(day, today);
                          return (
                            <td
                              key={idx}
                              className={isToday ? 'table-warning' : ''}
                              style={{ cursor: 'pointer', minHeight: 60, textAlign: 'center' }}
                              onClick={() => openDay(child.id, day)}
                              title="Click to add"
                            >
                              {items.length === 0 ? (
                                <span style={{ color: 'var(--rt-ink-muted)' }}>+</span>
                              ) : (
                                <div className="d-flex flex-wrap justify-content-center gap-1">
                                  {done > 0 && <Badge bg="success">{done}</Badge>}
                                  {late > 0 && <Badge bg="danger">{late}</Badge>}
                                  {open > 0 && <Badge bg="secondary">{open}</Badge>}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="p-3" style={{ borderTop: '3px solid var(--rt-border)' }}>
                <Row className="g-2 text-center">
                  <Col xs={4}>
                    <div style={{ padding: 10, border: '2px solid var(--rt-primary)' }}>
                      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', color: 'var(--rt-primary)' }}>
                        {weeklyStats.assigned}
                      </div>
                      <small>Assigned</small>
                    </div>
                  </Col>
                  <Col xs={4}>
                    <div style={{ padding: 10, border: '2px solid var(--rt-success)' }}>
                      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', color: 'var(--rt-success)' }}>
                        {weeklyStats.completed}
                      </div>
                      <small>Done</small>
                    </div>
                  </Col>
                  <Col xs={4}>
                    <div style={{ padding: 10, border: '2px solid var(--rt-danger)' }}>
                      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', color: 'var(--rt-danger)' }}>
                        {weeklyStats.overdue}
                      </div>
                      <small>Late</small>
                    </div>
                  </Col>
                </Row>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Full Add Modal */}
      <Modal show={showAddModal} onHide={() => !submitting && setShowAddModal(false)} centered>
        <Modal.Header closeButton={!submitting}>
          <Modal.Title>ADD HOMEWORK</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Child</Form.Label>
              <Form.Select value={formMember} onChange={(e) => setFormMember(e.target.value)} disabled={submitting}>
                <option value="">Select child...</option>
                {children.map((c) => <option key={c.id} value={c.id}>{avatarText(c.avatar)} {c.name}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Subject</Form.Label>
              <Form.Select value={formSubject} onChange={(e) => setFormSubject(e.target.value)} disabled={submitting}>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={2} value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe..." disabled={submitting} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Due Date</Form.Label>
              <Form.Control type="date" value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)} disabled={submitting} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)} disabled={submitting}>CANCEL</Button>
          <Button variant="success" onClick={handleAdd} disabled={!formMember || submitting}>
            {submitting ? 'SAVING...' : 'ADD'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Quick day-cell add */}
      <Modal show={showDayModal} onHide={() => !submitting && setShowDayModal(false)} centered>
        <Modal.Header closeButton={!submitting}>
          <Modal.Title style={{ fontSize: '0.8rem' }}>
            ADD: {dayModalDate ? dayModalDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Subject</Form.Label>
              <Form.Select value={formSubject} onChange={(e) => setFormSubject(e.target.value)} disabled={submitting}>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={2} value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe..." disabled={submitting} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowDayModal(false)} disabled={submitting}>CANCEL</Button>
          <Button variant="success" size="sm" onClick={handleAdd} disabled={submitting}>
            {submitting ? 'SAVING...' : 'ADD'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
