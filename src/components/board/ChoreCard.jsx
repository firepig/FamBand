import { useState, useContext } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Badge,
  Button,
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
import {
  deleteChore,
  uploadPhoto,
  approveChore,
  rejectChore,
  toggleChecklistItem,
  duplicateChore,
} from '../../api';
import Checklist from '../chores/Checklist';
import PhotoUpload from '../chores/PhotoUpload';
import ChoreForm from '../chores/ChoreForm';

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

  const {
    id, title, description, points, status,
    checklist, dueDate, due_date,
    category, photoProof, photo_proof,
    pointsApproved, points_approved,
    template_id, templateId,
  } = chore;
  const isRecurring = !!(template_id || templateId);
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
      await approveChore(id, currentMember.id);
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

  const handleDuplicate = async () => {
    if (!currentMember?.id) return;
    try {
      await duplicateChore(id, { createdBy: currentMember.id });
      notify?.('Quest duplicated!', 'success');
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
                {m.avatar || '👤'}
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
              <span className="rt-chore__cat" style={{ background: 'var(--rt-secondary)' }} title="Repeating quest">
                <FaSyncAlt size={8} style={{ marginRight: 3 }} />REPEAT
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

          {assignedMembers.length > 0 && (
            <div className="mb-3">
              <div style={{ color: 'var(--rt-ink-dim)', fontSize: '0.7rem', textTransform: 'uppercase', fontFamily: 'var(--rt-font-display)', marginBottom: 6 }}>
                Assigned
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {assignedMembers.map((m) => (
                  <span key={m.id} className="rt-view-badge">
                    {m.avatar || '👤'} {m.name}
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
              <Button variant="outline-warning" size="sm" onClick={handleDuplicate} title="Make a copy">
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

      <ChoreForm show={showEdit} onHide={() => setShowEdit(false)} editChore={chore} />
    </>
  );
}
