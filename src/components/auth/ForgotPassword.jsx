import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Container, Card, Form, Button, Alert } from 'react-bootstrap'
import { authResetPassword } from '../../api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const resp = await authResetPassword({ email, recoveryCode, newPassword })
      setSuccess(resp.remainingRecoveryCodes ?? 0)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(err.message || 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="py-5" style={{ maxWidth: 480 }}>
      <Card>
        <Card.Body>
          <h1 className="rt-page-title mb-3">RESET PASSWORD</h1>
          {success !== null && (
            <Alert variant="success">
              Password reset. {success} recovery code{success === 1 ? '' : 's'} remaining. Redirecting to sign in…
            </Alert>
          )}
          {error && <Alert variant="danger">{error}</Alert>}
          {success === null && (
            <Form onSubmit={submit}>
              <Form.Group className="mb-3">
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Recovery Code</Form.Label>
                <Form.Control value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())} required placeholder="XXXXX-XXXXX" />
                <Form.Text className="text-muted">One of the codes you saved when creating your family.</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>New Password <small className="text-muted">(min 8 chars)</small></Form.Label>
                <Form.Control type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              </Form.Group>
              <Button type="submit" disabled={busy} className="w-100">
                {busy ? 'Resetting…' : 'Reset password'}
              </Button>
            </Form>
          )}
          <div className="mt-3 small"><Link to="/login">Back to sign in</Link></div>
        </Card.Body>
      </Card>
    </Container>
  )
}
