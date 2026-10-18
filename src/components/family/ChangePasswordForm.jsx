import { useContext, useState } from 'react'
import { Form, Button, Alert, Spinner } from 'react-bootstrap'
import AppContext from '../../context/AppContext'
import { authChangePassword } from '../../api'

export default function ChangePasswordForm() {
  const { notify } = useContext(AppContext)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return }
    if (newPassword !== confirm) { setError('New passwords do not match'); return }
    setBusy(true)
    try {
      await authChangePassword({ currentPassword, newPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirm('')
      notify?.('Family password changed', 'success')
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
        <Form.Label>Current password</Form.Label>
        <Form.Control type="password" autoComplete="current-password" value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)} required />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>New password <small className="text-muted">(8+ characters)</small></Form.Label>
        <Form.Control type="password" autoComplete="new-password" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} required minLength={8} maxLength={200} />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Confirm new password</Form.Label>
        <Form.Control type="password" autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} required />
      </Form.Group>
      <Button type="submit" disabled={busy}>
        {busy ? <Spinner animation="border" size="sm" /> : 'Change password'}
      </Button>
    </Form>
  )
}
