import { useState, useContext, useMemo, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Row, Col, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { FaPlus, FaUser, FaTag, FaCrown, FaGamepad } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { updateChore } from '../../api';
import Column from './Column';
import ChoreForm from '../chores/ChoreForm';

const COLUMNS = [
  { status: 'todo',        title: 'TO DO',       cls: 'rt-column--todo' },
  { status: 'in_progress', title: 'IN PROGRESS', cls: 'rt-column--in_progress' },
  { status: 'done',        title: 'DONE',        cls: 'rt-column--done' },
];

const CATEGORIES = ['All', 'Chore', 'Homework', 'Outdoor', 'Kitchen', 'Other'];

function getAssigneeIds(chore) {
  const list = chore.assignments || chore.assignedTo || [];
  return list.map((a) => (typeof a === 'object' ? a.id : a));
}

export default function KanbanBoard() {
  const { chores, members, currentMember, isParent, loading, refresh, notify } = useContext(AppContext);
  const [showForm, setShowForm] = useState(false);
  const [filterMember, setFilterMember] = useState('all');
  const [filterCategory, setFilterCategory] = useState('All');

  // When a child is the active member, lock their board to their own chores.
  useEffect(() => {
    if (!isParent && currentMember) {
      setFilterMember(currentMember.id);
    } else if (isParent) {
      setFilterMember('all');
    }
  }, [isParent, currentMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const children = useMemo(() => members.filter((m) => m.role === 'child'), [members]);

  const filteredChores = useMemo(() => {
    let result = chores || [];
    if (filterMember !== 'all') {
      result = result.filter((chore) => getAssigneeIds(chore).includes(filterMember));
    }
    if (filterCategory !== 'All') {
      result = result.filter((chore) => chore.category === filterCategory);
    }
    return result;
  }, [chores, filterMember, filterCategory]);

  const columnChores = useMemo(() => {
    const map = {};
    COLUMNS.forEach((col) => { map[col.status] = []; });
    filteredChores.forEach((chore) => {
      if (map[chore.status] !== undefined) map[chore.status].push(chore);
      else map.todo.push(chore);
    });
    return map;
  }, [filteredChores]);

  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeChore = (chores || []).find((c) => c.id === active.id);
      if (!activeChore) return;
      const newStatus = over.id;
      if (newStatus === activeChore.status) return;
      if (!COLUMNS.some((c) => c.status === newStatus)) return;
      try {
        await updateChore(activeChore.id, { status: newStatus });
        if (newStatus === 'done') notify?.('Quest complete! +XP', 'success');
        refresh();
      } catch (err) {
        notify?.(err.message || 'Could not move quest', 'error');
      }
    },
    [chores, refresh, notify]
  );

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="warning" />
        <p className="mt-3 rt-blink" style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.8rem' }}>
          LOADING QUESTS...
        </p>
      </div>
    );
  }

  // Tab strip for parent: quick switch between kids
  const KidTabs = isParent && children.length > 0 ? (
    <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
      <span className="rt-view-badge"><FaCrown /> PARENT VIEW</span>
      <Button
        size="sm"
        variant={filterMember === 'all' ? 'warning' : 'secondary'}
        onClick={() => setFilterMember('all')}
      >
        All
      </Button>
      {children.map((c) => (
        <Button
          key={c.id}
          size="sm"
          variant={filterMember === c.id ? 'warning' : 'secondary'}
          onClick={() => setFilterMember(c.id)}
        >
          <span style={{ marginRight: 4 }}>{c.avatar || '👤'}</span>{c.name}
        </Button>
      ))}
    </div>
  ) : null;

  const KidViewBadge = !isParent && currentMember ? (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
      <span className="rt-view-badge" style={{ borderColor: 'var(--rt-primary)', color: 'var(--rt-primary)' }}>
        <FaGamepad /> {currentMember.name?.toUpperCase()}'S BOARD
      </span>
    </div>
  ) : null;

  return (
    <>
      <h1 className="rt-page-title">QUEST BOARD</h1>
      {KidTabs}
      {KidViewBadge}

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <InputGroup size="sm" style={{ minWidth: 180, maxWidth: 240 }}>
            <InputGroup.Text><FaTag /></InputGroup.Text>
            <Form.Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </Form.Select>
          </InputGroup>
        </div>

        <Button variant="success" onClick={() => setShowForm(true)}>
          <FaPlus className="me-1" /> NEW QUEST
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Row className="g-3">
          {COLUMNS.map((col) => (
            <Col key={col.status} md={4}>
              <Column
                title={col.title}
                status={col.status}
                chores={columnChores[col.status] || []}
                className={col.cls}
              />
            </Col>
          ))}
        </Row>
      </DndContext>

      <ChoreForm
        show={showForm}
        onHide={() => setShowForm(false)}
        editChore={null}
        defaultAssignee={
          isParent && filterMember !== 'all' ? filterMember
          : !isParent ? currentMember?.id
          : undefined
        }
      />
    </>
  );
}
