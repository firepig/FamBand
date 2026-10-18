import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Card, Row, Col, Button, Modal, Form, Alert, Badge } from 'react-bootstrap'
import AppContext from '../../context/AppContext'
import { createMember, deleteMember, updateMemberPin, fetchMembers } from '../../api'
import Avatar from '../common/Avatar';
import MemberEditor from './MemberEditor';
import { AVATARS, COLORS } from '../../utils/memberOptions';

export default function MemberManager() {
  const { user, currentMember, notify } = useContext(AppContext)
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [pinTarget, setPinTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchMembers()
      setMembers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    try {
      await deleteMember(deleteTarget.id)
      notify?.(`Removed ${deleteTarget.name}`, 'success')
      setDeleteTarget(null)
      load()
    } catch (err) {
      setError(err.message)
      setDeleteTarget(null)
    }
  }

  if (loading) return <Container className="py-4"><p>Loading…</p></Container>

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="rt-page-title mb-0">FAMILY</h1>
        <Button onClick={() => setShowAdd(true)}>+ Add member</Button>
      </div>
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
      <Row className="g-3">
        {members.map((m) => {
          const isOwner = m.user_id === user?.id
          const isSelf = m.id === currentMember?.id
          return (
            <Col xs={12} sm={6} lg={4} key={m.id}>
              <Card>
                <Card.Body>
                  <div className="d-flex align-items-center gap-3">
                    <div style={{ fontSize: '2.5rem' }}><Avatar avatar={m.avatar} /></div>
                    <div className="flex-grow-1">
                      <div className="fw-bold">{m.name}</div>
                      <div className="small">
                        <Badge bg={m.role === 'parent' ? 'warning' : 'secondary'}>{m.role}</Badge>
                        {isOwner && <Badge bg="info" className="ms-1">owner</Badge>}
                        {isSelf && <Badge bg="success" className="ms-1">you</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="d-flex gap-2 mt-3">
                    <Button size="sm" variant="outline-secondary" onClick={() => setEditTarget(m)}>
                      Edit
                    </Button>
                    {isSelf ? (
                      <Button size="sm" variant="outline-primary" as="a" href={`${import.meta.env.BASE_URL}profile`}
                        onClick={(e) => { e.preventDefault(); navigate('/profile') }}>
                        Change my PIN
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline-primary" onClick={() => setPinTarget(m)}>
                        Reset PIN
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={isOwner}
                      title={isOwner ? "Can't remove the account owner" : ''}
                      onClick={() => setDeleteTarget(m)}
                    >
                      Remove
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          )
        })}
      </Row>

      <AddMemberModal show={showAdd} onHide={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load() }} />
      <Modal show={!!editTarget} onHide={() => setEditTarget(null)} centered>
        <Modal.Header closeButton><Modal.Title>Edit {editTarget?.name}</Modal.Title></Modal.Header>
        <Modal.Body>
          {editTarget && (
            <MemberEditor key={editTarget.id} member={editTarget} canRename
              onSaved={() => { setEditTarget(null); load() }} />
          )}
        </Modal.Body>
      </Modal>
      <ResetPinModal target={pinTarget} onHide={() => setPinTarget(null)} onDone={() => { setPinTarget(null); load() }} />

      <Modal show={!!deleteTarget} onHide={() => setDeleteTarget(null)} centered>
        <Modal.Header closeButton><Modal.Title>Remove {deleteTarget?.name}?</Modal.Title></Modal.Header>
        <Modal.Body>
          <p>This removes the member and unlinks them from every quest and repeating quest.</p>
          <ul className="small mb-0">
            <li>Repeating quests left with no players are paused.</li>
            <li>Their earned and spent points history is kept but shown as “Former member”.</li>
            <li>Their bulletin posts, homework, snacks, achievements and points waiting for approval are deleted.</li>
          </ul>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Remove</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}

function AddMemberModal({ show, onHide, onCreated }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('child')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [avatar, setAvatar] = useState('🧒')
  const [color, setColor] = useState(COLORS[2])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setName(''); setRole('child'); setPin(''); setConfirmPin('')
    setAvatar('🧒'); setColor(COLORS[2]); setError(''); setBusy(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pin !== confirmPin) { setError('PINs do not match'); return }
    setBusy(true)
    try {
      await createMember({ name, role, pin, avatar, color })
      reset()
      onCreated()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal show={show} onHide={() => { reset(); onHide() }} centered>
      <Modal.Header closeButton><Modal.Title>Add member</Modal.Title></Modal.Header>
      <Form onSubmit={submit}>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>Name</Form.Label>
            <Form.Control value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={80} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Role</Form.Label>
            <Form.Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="child">Kid</option>
              <option value="parent">Parent</option>
            </Form.Select>
          </Form.Group>
          <Row>
            <Col>
              <Form.Group className="mb-3">
                <Form.Label>PIN <small className="text-muted">(4-6 digits)</small></Form.Label>
                <Form.Control type="password" inputMode="numeric" value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required maxLength={6} />
              </Form.Group>
            </Col>
            <Col>
              <Form.Group className="mb-3">
                <Form.Label>Confirm PIN</Form.Label>
                <Form.Control type="password" inputMode="numeric" value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} required maxLength={6} />
              </Form.Group>
            </Col>
          </Row>
          <Form.Group className="mb-3">
            <Form.Label>Avatar</Form.Label>
            <div className="d-flex flex-wrap gap-1">
              {AVATARS.map((a) => (
                <Button key={a} variant={avatar === a ? 'primary' : 'outline-secondary'}
                  onClick={(e) => { e.preventDefault(); setAvatar(a) }}
                  style={{ fontSize: '1.4rem', padding: '4px 10px' }}>
                  {a}
                </Button>
              ))}
            </div>
          </Form.Group>
          <Form.Group>
            <Form.Label>Color</Form.Label>
            <div className="d-flex flex-wrap gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 32, height: 32, border: color === c ? '3px solid #000' : '1px solid #999',
                    background: c, borderRadius: 4, cursor: 'pointer',
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { reset(); onHide() }}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}

function ResetPinModal({ target, onHide, onDone }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pin !== confirmPin) { setError('PINs do not match'); return }
    setBusy(true)
    try {
      await updateMemberPin(target.id, { pin })
      setPin(''); setConfirmPin('')
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal show={!!target} onHide={() => { setPin(''); setConfirmPin(''); setError(''); onHide() }} centered>
      <Modal.Header closeButton><Modal.Title>Reset PIN for {target?.name}</Modal.Title></Modal.Header>
      <Form onSubmit={submit}>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>New PIN</Form.Label>
            <Form.Control type="password" inputMode="numeric" value={pin} autoFocus
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required minLength={4} maxLength={6} />
          </Form.Group>
          <Form.Group>
            <Form.Label>Confirm PIN</Form.Label>
            <Form.Control type="password" inputMode="numeric" value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} required minLength={4} maxLength={6} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => onHide()}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Reset'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}
