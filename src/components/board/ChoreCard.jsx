import { useState, useContext, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Badge,
  Button,
  Form,
  Modal,
  ProgressBar,
  Spinner,
} from 'react-bootstrap';
import {
  FaStar,
  FaCamera,
  FaClock,
  FaTrash,
  FaTimes,
  FaCheck,
  FaEdit,
  FaCopy,
  FaSyncAlt,
} from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { formatDateKey } from '../../utils/rotation';
import {
  deleteChore,
  uploadPhoto,
  approveChore,
  rejectChore,
  toggleChecklistItem,
  duplicateChore,
  fetchTemplate,
  createTemplateOverride,
  deleteTemplateOverride,
} from '../../api';
import Checklist from '../chores/Checklist';
import PhotoUpload from '../chores/PhotoUpload';
import { uploadUrl } from '../../utils/images';
import ChoreForm from '../chores/ChoreForm';
import Avatar from '../common/Avatar';

const CATEGORY_COLORS = {
  Chore:    'var(--rt-cat-chore)',
  Homework: 'var(--rt-cat-homework)',
  Outdoor:  'var(--rt-cat-outdoor)',
  Kitchen:  'var(--rt-cat-kitchen)',
  Other:    'var(--rt-cat-other)',
};

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
}

function parseLocalDate(value) {
  if (!value) return null;
  const str = String(value).split('T')[0];
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return new Date(value);
  return new Date(y, m - 1, d);
}

function isOverdue(dueDate) {
  const due = parseLocalDate(dueDate);
  if (!due) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function formatDueDate(dueDate) {
  const d = parseLocalDate(dueDate);
  if (!d) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChoreCard({ chore }) {
  const { currentMember, isParent, members, refresh, notify } = useContext(AppContext);
  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [togglingItem, setTogglingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDupe, setShowDupe] = useState(false);
  const [rotTpl, setRotTpl] = useState(null); // the rotating series, loaded when the dialog opens
  const [swapTo, setSwapTo] = useState('');
  const [rotBusy, setRotBusy] = useState(false);

  const {
    id, title, description, points, status, image,
    checklist, dueDate, due_date,
    category, photoProof, photo_proof,
    pointsApproved, points_approved,
    template_id, templateId,
  } = chore;
  const isRecurring = !!(template_id || templateId);
  const rotation = chore.rotation; // present when this card belongs to a rotating series
  const photo = photoProof ?? photo_proof;
  const approved = !!(pointsApproved ?? points_approved);
  const due = dueDate ?? due_date;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 100 : 'auto' }
    : undefined;

  // Server returns `assignments`; older code used `assignedTo`. Support both.
  const assignedRaw = chore.assignments || chore.assignedTo || [];
  const assignedMembers = assignedRaw
    .map((a) => (typeof a === 'object' && a?.id ? a : members.find((m) => m.id === a)))
    .filter(Boolean);

  const completedItems = (checklist || []).filter((i) => i.completed).length;
  const totalItems = (checklist || []).length;
  const progress = totalItems ? (completedItems / totalItems) * 100 : 0;

  const handleToggleItem = async (itemId) => {
    setTogglingItem(itemId);
    try {
      await toggleChecklistItem(id, itemId);
      refresh();
    } catch (err) {
      notify?.(err.message || 'Could not toggle step', 'error');
    } finally {
      setTogglingItem(null);
    }
  };

  const handleUploadPhoto = async (file) => {
    setUploadingPhoto(true);
    try {
      await uploadPhoto(id, file);
      notify?.('Photo uploaded!', 'success');
      refresh();
    } catch (err) {
      notify?.(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleApprove = async () => {
    if (!currentMember?.id) return;
    try {
      await approveChore(id);
      notify?.('Quest approved! Points released.', 'success');
      refresh();
    } catch (err) {
      notify?.(err.message || 'Approval failed', 'error');
    }
  };

  const handleReject = async () => {
    try {
      await rejectChore(id);
      notify?.('Photo rejected', 'info');
      refresh();
    } catch (err) {
      notify?.(err.message || 'Reject failed', 'error');
    }
  };

  useEffect(() => {
    if (!showModal || !rotation || !(template_id || templateId)) return undefined;
    let cancelled = false;
    fetchTemplate(template_id || templateId).then((t) => { if (!cancelled) setRotTpl(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [showModal, rotation, template_id, templateId]);

  const changeTurn = async (action) => {
    const tid = template_id || templateId;
    setRotBusy(true);
    try {
      if (action === 'undo') {
        await deleteTemplateOverride(tid, rotation.onDuty.turnStart);
        notify?.('Back to the scheduled player', 'success');
      } else if (action === 'skip') {
        await createTemplateOverride(tid, { kind: 'skip' });
        notify?.('Turn skipped — the next player has it', 'success');
      } else {
        await createTemplateOverride(tid, { kind: 'swap', memberId: swapTo });
        notify?.('Turn swapped', 'success');
      }
      setSwapTo('');
      setShowModal(false);
      refresh();
    } catch (err) {
      notify?.(err.message || 'Could not change the turn', 'error');
    } finally {
      setRotBusy(false);
    }
  };

  const handleDuplicate = async (repeat = false) => {
    if (!currentMember?.id) return;
    setShowDupe(false);
    try {
      await duplicateChore(id, { createdBy: currentMember.id, repeat });
      notify?.(repeat ? 'Repeating quest duplicated!' : 'Quest duplicated!', 'success');
      setShowModal(false);
      refresh();
    } catch (err) {
      notify?.(err.message || 'Duplicate failed', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteChore(id);
      notify?.('Quest deleted', 'info');
      setConfirmDelete(false);
      setShowModal(false);
      refresh();
    } catch (err) {
      notify?.(err.message || 'Delete failed', 'error');
    }
  };

  const canApprove = isParent && status === 'done' && !approved;
  const catColor = getCategoryColor(category);

  return (
    <>
      <div ref={setNodeRef} style={dragStyle}>
        <div
          className={`rt-chore ${status === 'done' ? 'rt-chore--done' : ''}`}
          style={{ borderLeft: `6px solid ${catColor}` }}
          onClick={() => setShowModal(true)}
        >
          <div className="d-flex justify-content-between align-items-start gap-2">
            <span
              className="rt-chore__title"
              {...attributes}
              {...listeners}
              style={{ flex: 1 }}
            >
              {title}
            </span>
            <span className="rt-chore__points">
              <FaStar size={9} />{points}
            </span>
          </div>

          <div className="rt-chore__meta">
            {assignedMembers.slice(0, 4).map((m) => (
              <span key={m.id} className="rt-chore__avatar" title={m.name}>
                <Avatar avatar={m.avatar} />
              </span>
            ))}
            {assignedMembers.length > 4 && (
              <span style={{ fontSize: '0.75rem' }}>+{assignedMembers.length - 4}</span>
            )}
            {category && (
              <span className="rt-chore__cat" style={{ background: catColor }}>
                {category}
              </span>
            )}
            {isRecurring && (
              <span className="rt-chore__cat" style={{ background: 'var(--rt-secondary)' }} title={rotation && rotation.onDuty
                ? `Rotating quest. On duty: ${rotation.onDuty.name}. Next: ${rotation.next?.name} from ${formatDateKey(rotation.next?.startsOn)}`
                : 'Repeating quest'}>
                <FaSyncAlt size={8} style={{ marginRight: 3 }} />{rotation ? 'ROTATES' : 'REPEAT'}
              </span>
            )}
            {totalItems > 0 && (
              <span style={{ fontSize: '0.85rem' }}>
                <FaCheck size={9} /> {completedItems}/{totalItems}
              </span>
            )}
            {photo && <FaCamera size={11} title="Photo attached" style={{ color: 'var(--rt-accent)' }} />}
            {due && (
              <span style={{
                fontSize: '0.85rem',
                color: isOverdue(due) ? 'var(--rt-danger)' : 'var(--rt-ink-dim)'
              }}>
                <FaClock size={9} /> {formatDueDate(due)}
              </span>
            )}
            {status === 'done' && !approved && (
              <span className="rt-chore__cat" style={{ background: 'var(--rt-warning)' }}>
                PENDING
              </span>
            )}
            {approved && (
              <span className="rt-chore__cat" style={{ background: 'var(--rt-success)' }}>
                APPROVED
              </span>
            )}
          </div>

          {totalItems > 0 && (
            <ProgressBar now={progress} className="mt-2" style={{ height: 6 }} />
          )}
        </div>
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {image && (
            <img src={uploadUrl('quests', image)} alt=""
              style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }} />
          )}
          {description && <p style={{ color: 'var(--rt-ink-dim)' }}>{description}</p>}

          <div className="d-flex flex-wrap gap-2 mb-3">
            <Badge bg="warning"><FaStar /> {points} PTS</Badge>
            {category && (
              <Badge bg="secondary" style={{ background: catColor, color: '#0a0918' }}>
                {category}
              </Badge>
            )}
            <Badge bg="info">
              {status === 'todo' ? 'TO DO' : status === 'in_progress' ? 'IN PROGRESS' : 'DONE'}
            </Badge>
            {status === 'done' && approved && <Badge bg="success"><FaCheck /> APPROVED</Badge>}
            {status === 'done' && !approved && <Badge bg="warning">PENDING</Badge>}
            {due && (
              <Badge bg={isOverdue(due) ? 'danger' : 'secondary'}>
                <FaClock /> {formatDueDate(due)}
              </Badge>
            )}
          </div>

          {rotation && rotation.onDuty && (
            <div className="mb-3">
              <div style={{ color: 'var(--rt-ink-dim)', fontSize: '0.7rem', textTransform: 'uppercase', fontFamily: 'var(--rt-font-display)', marginBottom: 6 }}>
                Rotation
              </div>
              <div>
                On duty: <strong>{rotation.onDuty.name}</strong>
                {rotation.onDuty.overridden && <span style={{ color: 'var(--rt-ink-dim)' }}> (swapped for this turn)</span>}
                {' '}until {formatDateKey(rotation.onDuty.turnEnd)}
              </div>
              {rotation.next && (
                <div className="small" style={{ color: 'var(--rt-ink-dim)' }}>
                  Next: {rotation.next.name} from {formatDateKey(rotation.next.startsOn)}
                </div>
              )}
              {isParent && rotTpl?.rotation?.enabled && (
                <div className="d-flex flex-wrap gap-2 align-items-center mt-2">
                  <Form.Select size="sm" style={{ maxWidth: 190 }} value={swapTo} aria-label="Swap this turn to"
                    onChange={(e) => setSwapTo(e.target.value)}>
                    <option value="">Swap this turn to…</option>
                    {(rotTpl.assignments || [])
                      .filter((a) => a.id !== rotation.onDuty.scheduledMemberId)
                      .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Form.Select>
                  <Button size="sm" variant="outline-warning" disabled={!swapTo || rotBusy} onClick={() => changeTurn('swap')}>Swap</Button>
                  <Button size="sm" variant="outline-secondary" disabled={rotBusy} onClick={() => changeTurn('skip')}>Skip this turn</Button>
                  {rotation.onDuty.overridden && (
                    <Button size="sm" variant="outline-danger" disabled={rotBusy} onClick={() => changeTurn('undo')}>Undo</Button>
                  )}
                </div>
              )}
            </div>
          )}

          {assignedMembers.length > 0 && (
            <div className="mb-3">
              <div style={{ color: 'var(--rt-ink-dim)', fontSize: '0.7rem', textTransform: 'uppercase', fontFamily: 'var(--rt-font-display)', marginBottom: 6 }}>
                Assigned
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {assignedMembers.map((m) => (
                  <span key={m.id} className="rt-view-badge">
                    <Avatar avatar={m.avatar} /> {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <div style={{ color: 'var(--rt-ink-dim)', fontSize: '0.7rem', textTransform: 'uppercase', fontFamily: 'var(--rt-font-display)', marginBottom: 6 }}>
              Steps
            </div>
            {totalItems > 0 && (
              <ProgressBar now={progress} label={`${completedItems}/${totalItems}`} className="mb-2" style={{ height: 18 }} />
            )}
            <Checklist
              items={checklist || []}
              choreId={id}
              readOnly={!currentMember}
              onToggle={handleToggleItem}
            />
            {togglingItem && <Spinner animation="border" size="sm" />}
          </div>

          <div className="mb-3">
            <div style={{ color: 'var(--rt-ink-dim)', fontSize: '0.7rem', textTransform: 'uppercase', fontFamily: 'var(--rt-font-display)', marginBottom: 6 }}>
              Photo Proof
            </div>
            {uploadingPhoto ? (
              <div className="text-center py-3">
                <Spinner animation="border" />
                <p className="mt-2" style={{ color: 'var(--rt-ink-dim)' }}>Uploading...</p>
              </div>
            ) : (
              <PhotoUpload currentPhoto={photo || null} onUpload={handleUploadPhoto} />
            )}
          </div>

          {canApprove && (
            <div className="d-flex gap-2 pt-3 border-top">
              <Button variant="success" onClick={handleApprove}>
                <FaCheck className="me-1" /> APPROVE
              </Button>
              <Button variant="outline-danger" onClick={handleReject}>
                <FaTimes className="me-1" /> REJECT
              </Button>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between">
          <div className="d-flex gap-2">
            {isParent && (
              <Button variant="outline-primary" size="sm" onClick={() => { setShowModal(false); setShowEdit(true); }}>
                <FaEdit className="me-1" /> EDIT
              </Button>
            )}
            {isParent && (
              <Button variant="outline-warning" size="sm" onClick={() => (isRecurring ? setShowDupe(true) : handleDuplicate(false))} title="Make a copy">
                <FaCopy className="me-1" /> DUPE
              </Button>
            )}
            {isParent && !confirmDelete && (
              <Button variant="outline-danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <FaTrash className="me-1" /> DELETE
              </Button>
            )}
            {isParent && confirmDelete && (
              <div className="d-flex align-items-center gap-2">
                <span style={{ color: 'var(--rt-danger)', fontSize: '0.8rem' }}>Sure?</span>
                <Button variant="danger" size="sm" onClick={handleDelete}>YES</Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>NO</Button>
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={() => setShowModal(false)}>CLOSE</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDupe} onHide={() => setShowDupe(false)} centered>
        <Modal.Header closeButton><Modal.Title>Duplicate repeating quest</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            <strong>{title}</strong> repeats on a schedule. Should the copy repeat too, or be a single quest?
          </p>
        </Modal.Body>
        <Modal.Footer className="flex-wrap">
          <Button variant="secondary" onClick={() => setShowDupe(false)}>Cancel</Button>
          <Button variant="outline-warning" onClick={() => handleDuplicate(false)}>Just this once</Button>
          <Button variant="warning" onClick={() => handleDuplicate(true)}>Repeat it too</Button>
        </Modal.Footer>
      </Modal>

      <ChoreForm show={showEdit} onHide={() => setShowEdit(false)} editChore={chore} />
    </>
  );
}
