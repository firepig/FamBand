import { useState, useEffect, useContext } from 'react';
import {
  Modal,
  Form,
  Button,
  Row,
  Col,
  InputGroup,
  Alert,
} from 'react-bootstrap';
import { FaPlus, FaTimes } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { createChore, updateChore } from '../../api';

const QUICK_POINTS = [5, 10, 20, 50];
const CATEGORIES = ['Chore', 'Homework', 'Outdoor', 'Kitchen', 'Other'];

export default function ChoreForm({ show, onHide, editChore, defaultAssignee }) {
  const { members, currentMember, isParent, refresh, notify } = useContext(AppContext);
  const isEditing = !!editChore;
  const children = members.filter((m) => m.role === 'child');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(10);
  const [assignedTo, setAssignedTo] = useState([]);
  const [category, setCategory] = useState('Chore');
  const [dueDate, setDueDate] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [validated, setValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;

    if (editChore) {
      setTitle(editChore.title || '');
      setDescription(editChore.description || '');
      setPoints(editChore.points ?? 10);
      const existing = editChore.assignments || editChore.assignedTo || [];
      setAssignedTo(existing.map((a) => (typeof a === 'object' ? a.id : a)));
      setCategory(editChore.category || 'Chore');
      setDueDate(editChore.dueDate || editChore.due_date
        ? String(editChore.dueDate || editChore.due_date).split('T')[0]
        : '');
      setChecklist(
        (editChore.checklist || []).map((item) => ({
          id: item.id,
          text: item.text,
          completed: !!item.completed,
        }))
      );
    } else {
      // Sensible defaults for new chore
      let initialAssignee = [];
      if (defaultAssignee) {
        initialAssignee = [defaultAssignee];
      } else if (!isParent && currentMember) {
        // Kid creating: assign to themselves
        initialAssignee = [currentMember.id];
      } else if (children.length === 1) {
        // Single child family: auto-assign
        initialAssignee = [children[0].id];
      }
      setTitle('');
      setDescription('');
      setPoints(10);
      setAssignedTo(initialAssignee);
      setCategory('Chore');
      setDueDate('');
      setChecklist([]);
    }
    setValidated(false);
    setError(null);
  }, [show, editChore, defaultAssignee]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMemberToggle = (memberId) => {
    setAssignedTo((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleAddStep = () => {
    setChecklist((prev) => [
      ...prev,
      { id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: '', completed: false },
    ]);
  };

  const handleRemoveStep = (id) => setChecklist((p) => p.filter((i) => i.id !== id));
  const handleStepText = (id, text) =>
    setChecklist((p) => p.map((i) => (i.id === id ? { ...i, text } : i)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidated(true);

    if (!title.trim()) return;
    if (assignedTo.length === 0) {
      setError('Please assign this quest to at least one player.');
      return;
    }
    if (!currentMember?.id) {
      setError('No active player — switch player in the top bar.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      points: Number(points) || 0,
      assignedTo,
      category,
      dueDate: dueDate || null,
      createdBy: currentMember.id,
      checklist: checklist
        .filter((i) => i.text.trim() !== '')
        .map((i) => ({ ...i, text: i.text.trim() })),
    };

    setSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        await updateChore(editChore.id, payload);
        notify?.('Quest updated!', 'success');
      } else {
        await createChore(payload);
        notify?.('New quest added!', 'success');
      }
      refresh();
      onHide();
    } catch (err) {
      setError(err.message || 'Could not save quest. Try again.');
      notify?.(err.message || 'Save failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{isEditing ? 'EDIT QUEST' : 'NEW QUEST'}</Modal.Title>
      </Modal.Header>
      <Form noValidate validated={validated} onSubmit={handleSubmit}>
        <Modal.Body>
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Form.Group className="mb-3">
            <Form.Label>Quest Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. Defeat the dishes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              isInvalid={validated && !title.trim()}
              autoFocus
            />
            <Form.Control.Feedback type="invalid">Name is required</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="Optional details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Reward (points)</Form.Label>
            <Row className="g-2 mb-2">
              {QUICK_POINTS.map((val) => (
                <Col key={val} xs="auto">
                  <Button
                    type="button"
                    variant={points === val ? 'warning' : 'outline-warning'}
                    size="sm"
                    onClick={() => setPoints(val)}
                  >
                    {val}
                  </Button>
                </Col>
              ))}
              <Col xs="auto">
                <Form.Control
                  type="number"
                  min={1}
                  max={999}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value) || 0)}
                  style={{ maxWidth: 100 }}
                />
              </Col>
            </Row>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              Assign To {!isParent && <span style={{ color: 'var(--rt-ink-dim)' }}>(you can only assign quests to yourself)</span>}
            </Form.Label>
            <Row className="g-2">
              {members.map((member) => {
                const disabledForKid = !isParent && currentMember && member.id !== currentMember.id;
                return (
                  <Col xs={6} sm={4} key={member.id}>
                    <Form.Check
                      type="checkbox"
                      id={`assign-${member.id}`}
                      label={
                        <span className="d-inline-flex align-items-center gap-2">
                          <span style={{ fontSize: '1.1rem' }}>{member.avatar || '👤'}</span>
                          <span>{member.name}</span>
                          <small style={{ color: 'var(--rt-ink-dim)', fontSize: '0.7rem' }}>
                            ({member.role})
                          </small>
                        </span>
                      }
                      checked={assignedTo.includes(member.id)}
                      onChange={() => handleMemberToggle(member.id)}
                      disabled={disabledForKid}
                      isInvalid={validated && assignedTo.length === 0}
                    />
                  </Col>
                );
              })}
            </Row>
            {validated && assignedTo.length === 0 && (
              <div className="text-danger small mt-1">Assign to at least one player.</div>
            )}
          </Form.Group>

          <Row className="g-3 mb-3">
            <Col sm={6}>
              <Form.Label>Category</Form.Label>
              <Form.Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </Form.Select>
            </Col>
            <Col sm={6}>
              <Form.Label>Due Date</Form.Label>
              <Form.Control
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Col>
          </Row>

          <Form.Group className="mb-2">
            <Form.Label>Sub-Steps</Form.Label>
            {checklist.length === 0 && (
              <p style={{ color: 'var(--rt-ink-dim)', fontSize: '0.9rem' }}>No steps yet.</p>
            )}
            {checklist.map((item, index) => (
              <InputGroup className="mb-2" key={item.id}>
                <InputGroup.Text>{index + 1}</InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Step description"
                  value={item.text}
                  onChange={(e) => handleStepText(item.id, e.target.value)}
                />
                <Button type="button" variant="outline-danger" onClick={() => handleRemoveStep(item.id)}>
                  <FaTimes />
                </Button>
              </InputGroup>
            ))}
            <Button type="button" variant="outline-primary" size="sm" onClick={handleAddStep}>
              <FaPlus className="me-1" /> Add Step
            </Button>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={onHide} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="success" disabled={submitting}>
            {submitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
