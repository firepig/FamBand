import { useState, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Container, Card, Form, Button, Alert, Row, Col } from 'react-bootstrap'
import AppContext from '../../context/AppContext'

export default function Register() {
  const { register } = useContext(AppContext)
  const [familyName, setFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pin !== confirmPin) { setError('PINs do not match'); return }
    setBusy(true)
    try {
      const resp = await register({ familyName, displayName, email, password, pin })
      setRecoveryCodes(resp.recoveryCodes)
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCodes) {
    return <RecoveryCodesScreen codes={recoveryCodes} onDone={() => navigate('/select-member', { replace: true })} />
  }

  return (
    <Container className="py-5" style={{ maxWidth: 560 }}>
      <Card>
        <Card.Body>
          <h1 className="rt-page-title mb-3">CREATE FAMILY</h1>
          <p className="text-muted small">You'll be the first parent on this family account.</p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={submit}>
            <Form.Group className="mb-3">
              <Form.Label>Family Name</Form.Label>
              <Form.Control value={familyName} onChange={(e) => setFamilyName(e.target.value)} required autoFocus maxLength={80} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Your Display Name</Form.Label>
              <Form.Control value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={80} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password <small className="text-muted">(min 8 chars)</small></Form.Label>
              <Form.Control type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </Form.Group>
            <Row>
              <Col>
                <Form.Group className="mb-3">
                  <Form.Label>Your PIN <small className="text-muted">(4-6 digits)</small></Form.Label>
                  <Form.Control type="password" inputMode="numeric" pattern="\d{4,6}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required maxLength={6} />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-3">
                  <Form.Label>Confirm PIN</Form.Label>
                  <Form.Control type="password" inputMode="numeric" pattern="\d{4,6}" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} required maxLength={6} />
                </Form.Group>
              </Col>
            </Row>
            <Button type="submit" disabled={busy} className="w-100">
              {busy ? 'Creating…' : 'Create family'}
            </Button>
          </Form>
          <div className="mt-3 small">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </Card.Body>
      </Card>
    </Container>
  )
}

function RecoveryCodesScreen({ codes, onDone }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const text = codes.join('\n')
  const copy = () => navigator.clipboard?.writeText(text)
  const download = () => {
    const blob = new Blob([`FamBand recovery codes — save these somewhere safe\n\n${text}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'famband-recovery-codes.txt'; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Container className="py-5" style={{ maxWidth: 600 }}>
      <Card>
        <Card.Body>
          <h1 className="rt-page-title mb-3">RECOVERY CODES</h1>
          <Alert variant="warning">
            <strong>Save these codes now.</strong> They let you reset your password if you forget it. Each code can be used once. We won't show them again.
          </Alert>
          <pre style={{ background: 'var(--rt-bg, #111)', color: '#fff', padding: 16, borderRadius: 6, fontSize: '1.05rem' }}>{text}</pre>
          <div className="d-flex gap-2 mb-3">
            <Button variant="secondary" onClick={copy}>Copy</Button>
            <Button variant="secondary" onClick={download}>Download .txt</Button>
          </div>
          <Form.Check
            type="checkbox"
            id="ack-recovery"
            label="I have saved these codes somewhere safe"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mb-3"
          />
          <Button onClick={onDone} disabled={!acknowledged} className="w-100">Continue</Button>
        </Card.Body>
      </Card>
    </Container>
  )
}
