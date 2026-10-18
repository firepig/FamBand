import { useContext, useRef, useState } from 'react'
import { Form, Button, Alert, Spinner } from 'react-bootstrap'
import { FaUpload } from 'react-icons/fa'
import AppContext from '../../context/AppContext'
import { updateMember, uploadAvatar } from '../../api'
import { AVATARS, COLORS } from '../../utils/memberOptions'
import { ACCEPTED_IMAGE_TYPES, MAX_MB, validateImageFile, isImageAvatar } from '../../utils/images'
import Avatar from '../common/Avatar'

// Edit one member's name, color and avatar (emoji or uploaded image).
// `canRename` is false when a non-parent edits themselves (server enforces it too).
export default function MemberEditor({ member, canRename, onSaved }) {
  const { refresh, refreshSession, notify } = useContext(AppContext)
  const [name, setName] = useState(member.name)
  const [color, setColor] = useState(member.color || COLORS[0])
  const [avatar, setAvatar] = useState(member.avatar || '👤')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const afterChange = async (updated) => {
    await Promise.all([refreshSession(), refresh()])
    onSaved?.(updated)
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = validateImageFile(file, MAX_MB.avatar)
    if (problem) { setError(problem); return }
    setError('')
    setUploading(true)
    try {
      const updated = await uploadAvatar(member.id, file)
      setAvatar(updated.avatar)
      notify?.('Avatar updated!', 'success')
      await afterChange(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const patch = {}
    if (canRename && name.trim() !== member.name) patch.name = name.trim()
    if (color !== member.color) patch.color = color
    // An uploaded image is saved at upload time; only send an emoji change.
    if (!isImageAvatar(avatar) && avatar !== member.avatar) patch.avatar = avatar
    // Switching from an uploaded image back to an emoji.
    if (isImageAvatar(member.avatar) && !isImageAvatar(avatar)) patch.avatar = avatar
    if (Object.keys(patch).length === 0) { notify?.('No changes to save', 'info'); return }
    setBusy(true)
    try {
      const updated = await updateMember(member.id, patch)
      notify?.('Profile saved!', 'success')
      await afterChange(updated)
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
        <Form.Label>Name</Form.Label>
        <Form.Control value={name} onChange={(e) => setName(e.target.value)}
          maxLength={80} required disabled={!canRename} />
        {!canRename && <Form.Text className="text-muted">Ask a parent to change your name.</Form.Text>}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Avatar</Form.Label>
        <div className="d-flex align-items-center gap-3 mb-2">
          <div style={{ fontSize: '3rem', lineHeight: 1 }}><Avatar avatar={avatar} size="3rem" /></div>
          <div>
            <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES}
              onChange={handleFile} style={{ display: 'none' }} />
            <Button type="button" variant="outline-primary" size="sm" disabled={uploading}
              onClick={() => fileRef.current?.click()}>
              {uploading ? <Spinner animation="border" size="sm" /> : <><FaUpload className="me-1" />Upload picture</>}
            </Button>
            <div className="small text-muted mt-1">JPEG, PNG, GIF or WebP, up to {MAX_MB.avatar} MB</div>
          </div>
        </div>
        <div className="small text-muted mb-1">…or pick an emoji:</div>
        <div className="d-flex flex-wrap gap-1">
          {AVATARS.map((a) => (
            <Button key={a} type="button" variant={avatar === a ? 'primary' : 'outline-secondary'}
              onClick={() => setAvatar(a)} style={{ fontSize: '1.4rem', padding: '4px 10px' }}>
              {a}
            </Button>
          ))}
        </div>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label>Color</Form.Label>
        <div className="d-flex flex-wrap gap-1">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
              style={{
                width: 32, height: 32, border: color === c ? '3px solid #000' : '1px solid #999',
                background: c, borderRadius: 4, cursor: 'pointer',
              }} />
          ))}
        </div>
      </Form.Group>

      <Button type="submit" disabled={busy || uploading}>
        {busy ? <Spinner animation="border" size="sm" /> : 'Save changes'}
      </Button>
    </Form>
  )
}
