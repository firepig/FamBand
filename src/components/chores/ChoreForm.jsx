import { useState, useEffect, useContext, useRef } from 'react';
import {
  Modal,
  Form,
  Button,
  Row,
  Col,
  InputGroup,
  Alert,
} from 'react-bootstrap';
import { FaPlus, FaTimes, FaImage } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { createChore, updateChore, createTemplate, uploadQuestImage } from '../../api';
import { ACCEPTED_IMAGE_TYPES, prepareImageForUpload, uploadUrl, validateImageType, isCroppable } from '../../utils/images';
import ImageCropModal from '../common/ImageCropModal';
import Avatar from '../common/Avatar';

const QUICK_POINTS = [5, 10, 20, 50];
const CATEGORIES = ['Chore', 'Homework', 'Outdoor', 'Kitchen', 'Other'];
const FREQ_OPTIONS = [
  { value: 'once',     label: "Doesn't repeat" },
  { value: 'daily',    label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly',   label: 'Weekly (pick days)' },
  { value: 'custom',   label: 'Custom (pick days)' },
];
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  const [frequency, setFrequency] = useState('once');
  const [daysOfWeek, setDaysOfWeek] = useState([]); // numeric 0-6
  const [perMember, setPerMember] = useState(true);
  const [validated, setValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [image, setImage] = useState(null); // stored filename from /api/uploads/quest
  const [imageBusy, setImageBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const imageInputRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;

    if (editChore) {
      setTitle(editChore.title || '');
      setDescription(editChore.description || '');
      setImage(editChore.image || null);
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
      setImage(null);
      setPoints(10);
      setAssignedTo(initialAssignee);
      setCategory('Chore');
      setDueDate('');
      setChecklist([]);
      setFrequency('once');
      setDaysOfWeek([]);
      setPerMember(true);
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

  const handleImageFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setError(null);
    if (isCroppable(picked)) {
      const typeProblem = validateImageType(picked);
      if (typeProblem) { setError(typeProblem); return; }
      setCropFile(picked);
    } else {
      await uploadQuestPicked(picked);
    }
  };

  const uploadQuestPicked = async (picked) => {
    setImageBusy(true);
    try {
      const { file, error: problem } = await prepareImageForUpload(picked, 'quest');
      if (problem) { setError(problem); return; }
      const res = await uploadQuestImage(file);
      setImage(res.image);
    } catch (err) {
      setError(err.message || 'Image upload failed');
    } finally {
      setImageBusy(false);
    }
  };

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

    // Validate days for weekly/custom
    if ((frequency === 'weekly' || frequency === 'custom') && daysOfWeek.length === 0) {
      setError('Pick at least one day of the week for the repeat schedule.');
      return;
    }

    const cleanChecklist = checklist
      .filter((i) => i.text.trim() !== '')
      .map((i) => ({ ...i, text: i.text.trim() }));

    // Only parents can attach images (the upload endpoint is parent-only).
    const imageField = isParent ? { image } : {};

    setSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        // Editing an existing instance — don't change its recurrence here.
        await updateChore(editChore.id, {
          title: title.trim(),
          description: description.trim(),
          points: Number(points) || 0,
          assignedTo,
          category,
          dueDate: dueDate || null,
          createdBy: currentMember.id,
          checklist: cleanChecklist,
          ...imageField,
        });
        notify?.('Quest updated!', 'success');
      } else if (frequency === 'once') {
        await createChore({
          title: title.trim(),
          description: description.trim(),
          points: Number(points) || 0,
          assignedTo,
          category,
          dueDate: dueDate || null,
          createdBy: currentMember.id,
          checklist: cleanChecklist,
          ...imageField,
        });
        notify?.('New quest added!', 'success');
      } else {
        // Recurring → create a template; instances materialize on next fetch.
        await createTemplate({
          title: title.trim(),
          description: description.trim(),
          points: Number(points) || 0,
          assignedTo,
          category,
          createdBy: currentMember.id,
          checklist: cleanChecklist,
          frequency,
          daysOfWeek: (frequency === 'weekly' || frequency === 'custom') ? daysOfWeek : [],
          startDate: dueDate || null,
          active: true,
          perMember,
          ...imageField,
        });
        notify?.('Repeating quest set up!', 'success');
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

  const toggleDow = (n) => {
    setDaysOfWeek((prev) => prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n].sort());
  };

  return (
    <>
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

          {isParent && (
            <Form.Group className="mb-3">
              <Form.Label>Picture <small className="text-muted">(optional)</small></Form.Label>
              <div className="d-flex align-items-center gap-3 flex-wrap">
                {image && (
                  <img src={uploadUrl('quests', image)} alt="Quest"
                    style={{ maxHeight: 96, maxWidth: 160, borderRadius: 6, border: '1px solid #dee2e6' }} />
                )}
                <input ref={imageInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES}
                  onChange={handleImageFile} style={{ display: 'none' }} />
                <Button type="button" variant="outline-secondary" size="sm" disabled={imageBusy}
                  onClick={() => imageInputRef.current?.click()}>
                  <FaImage className="me-1" />
                  {imageBusy ? 'Uploading…' : image ? 'Replace picture' : 'Add picture'}
                </Button>
                {image && !imageBusy && (
                  <Button type="button" variant="outline-danger" size="sm" onClick={() => setImage(null)}>
                    <FaTimes className="me-1" />Remove
                  </Button>
                )}
              </div>
              <Form.Text className="text-muted">JPEG, PNG, GIF or WebP. You can crop it before saving.</Form.Text>
            </Form.Group>
          )}

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
                          <span style={{ fontSize: '1.1rem' }}><Avatar avatar={member.avatar} /></span>
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
              <Form.Label>{frequency === 'once' ? 'Due Date' : 'Starts On (optional)'}</Form.Label>
              <Form.Control
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Col>
          </Row>

          {!isEditing && (
            <Form.Group className="mb-3">
              <Form.Label>Repeats</Form.Label>
              <Form.Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Form.Select>

              {(frequency === 'weekly' || frequency === 'custom') && (
                <div className="d-flex flex-wrap gap-2 mt-2" role="group" aria-label="Days of week">
                  {DOW_LABELS.map((lbl, idx) => {
                    const active = daysOfWeek.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDow(idx)}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          width: 36, height: 36,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          border: `2px solid ${active ? 'var(--rt-accent)' : 'var(--rt-border)'}`,
                          background: active ? 'var(--rt-accent)' : 'var(--rt-bg-2)',
                          color: active ? 'var(--rt-border-dark)' : 'var(--rt-ink)',
                          fontFamily: 'var(--rt-font-display)',
                          fontSize: '0.7rem',
                          boxShadow: active ? 'inset 1px 1px 0 rgba(0,0,0,0.3)' : '2px 2px 0 var(--rt-border-dark)',
                        }}
                        title={['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][idx]}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}
              {frequency !== 'once' && (
                <>
                  {assignedTo.length > 1 && (
                    <div className="mt-2">
                      <Form.Check
                        type="switch"
                        id="per-member-toggle"
                        label="Separate quest per kid (each person gets their own card)"
                        checked={perMember}
                        onChange={(e) => setPerMember(e.target.checked)}
                      />
                    </div>
                  )}
                  <small style={{ color: 'var(--rt-ink-dim)', display: 'block', marginTop: 6 }}>
                    {perMember && assignedTo.length > 1
                      ? `Each scheduled day, ${assignedTo.length} copies will appear — one per kid.`
                      : 'A copy of this quest will appear on each scheduled day, ready to complete.'}
                  </small>
                </>
              )}
            </Form.Group>
          )}

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
    <ImageCropModal file={cropFile} aspect={16 / 9} outputWidth={1600} title="Adjust quest picture"
      onCancel={() => setCropFile(null)}
      onConfirm={(cropped) => { setCropFile(null); uploadQuestPicked(cropped); }} />
    </>
  );
}
