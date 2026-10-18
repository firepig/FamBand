import { useContext, useState } from 'react'
import { Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap'
import AppContext from '../../context/AppContext'
import { updateMemberPin } from '../../api'

const digits = (v) => v.replace(/\D/g, '')

export default function ChangePinForm({ memberId }) {
  const { notify } = useContext(AppContext)
  const [currentPin, setCurrentPin] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pin.length < 4) { setError('New PIN must be 4 to 6 digits'); return }
    if (pin !== confirm) { setError('New PINs do not match'); return }
    setBusy(true)
    try {
      await updateMemberPin(memberId, { pin, currentPin })
      setCurrentPin(''); setPin(''); setConfirm('')
      notify?.('PIN changed', 'success')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Form onSubmit={submit}>
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
      <Form.Group className="mb-3">
        <Form.Label>Current PIN</Form.Label>
        <Form.Control type="password" inputMode="numeric" autoComplete="off" value={currentPin}
          onChange={(e) => setCurrentPin(digits(e.target.value))} required minLength={4} maxLength={6} />
      </Form.Group>
      <Row>
        <Col>
          <Form.Group className="mb-3">
            <Form.Label>New PIN <small className="text-muted">(4-6 digits)</small></Form.Label>
            <Form.Control type="password" inputMode="numeric" autoComplete="off" value={pin}
              onChange={(e) => setPin(digits(e.target.value))} required minLength={4} maxLength={6} />
          </Form.Group>
        </Col>
        <Col>
          <Form.Group className="mb-3">
            <Form.Label>Confirm new PIN</Form.Label>
            <Form.Control type="password" inputMode="numeric" autoComplete="off" value={confirm}
              onChange={(e) => setConfirm(digits(e.target.value))} required minLength={4} maxLength={6} />
          </Form.Group>
        </Col>
      </Row>
      <Button type="submit" disabled={busy}>
        {busy ? <Spinner animation="border" size="sm" /> : 'Change PIN'}
      </Button>
      <div className="small text-muted mt-2">
        Forgot your PIN? Ask a parent to reset it from the Family page.
      </div>
    </Form>
  )
}
