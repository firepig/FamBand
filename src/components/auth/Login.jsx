import { useState, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Container, Card, Form, Button, Alert } from 'react-bootstrap'
import AppContext from '../../context/AppContext'

export default function Login() {
  const { login } = useContext(AppContext)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await login({ email, password })
      navigate('/select-member', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="py-5" style={{ maxWidth: 480 }}>
      <Card>
        <Card.Body>
          <h1 className="rt-page-title mb-3">SIGN IN</h1>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={submit}>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </Form.Group>
            <Button type="submit" disabled={busy} className="w-100">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Form>
          <div className="d-flex justify-content-between mt-3 small">
            <Link to="/register">Create a family</Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </Card.Body>
      </Card>
    </Container>
  )
}
