import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Card, Row, Col, Modal, Form, Button, Alert, Spinner } from 'react-bootstrap'
import AppContext from '../../context/AppContext'
import { fetchMembers } from '../../api'
import Avatar from '../common/Avatar';

export default function SelectMember() {
  const { selectMember, logout, user, family } = useContext(AppContext)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchMembers().then((m) => setMembers(m)).catch(() => setMembers([])).finally(() => setLoading(false))
  }, [])

  const open = (member) => { setTarget(member); setPin(''); setError('') }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await selectMember(target.id, pin)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Wrong PIN')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <Container className="py-5 text-center"><Spinner animation="border" /></Container>
  }

  return (
    <Container className="py-5" style={{ maxWidth: 900 }}>
      <div className="d-flex justify-content-between align-items-end mb-3">
        <div>
          <h1 className="rt-page-title">WHO'S PLAYING?</h1>
          <div className="text-muted small">{family?.name} · signed in as {user?.email}</div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-warning" size="sm" onClick={() => navigate('/billboard')}>Billboard view</Button>
          <Button variant="outline-secondary" size="sm" onClick={logout}>Sign out</Button>
        </div>
      </div>
      <Row className="g-3">
        {members.length === 0 && (
          <Col><Alert variant="info">No members yet. A parent needs to be set up first.</Alert></Col>
        )}
        {members.map((m) => (
          <Col xs={6} md={4} lg={3} key={m.id}>
            <Card
              onClick={() => m.has_pin && open(m)}
              style={{ cursor: m.has_pin ? 'pointer' : 'not-allowed', opacity: m.has_pin ? 1 : 0.5 }}
              className="text-center h-100"
            >
              <Card.Body>
                <div style={{ fontSize: '3rem' }}><Avatar avatar={m.avatar} /></div>
                <div className="fw-bold">{m.name}</div>
                <div className="small text-muted text-uppercase">{m.role}</div>
                {!m.has_pin && <div className="small text-danger mt-1">No PIN set</div>}
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal show={!!target} onHide={() => setTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Enter PIN for {target?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={submit}>
            <Form.Control
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              placeholder="PIN"
            />
            <Button type="submit" disabled={busy || pin.length < 4} className="w-100 mt-3">
              {busy ? 'Checking…' : 'Enter'}
            </Button>
          </Form>
        </Modal.Body>
      </Modal>
    </Container>
  )
}
