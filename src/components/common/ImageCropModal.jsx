import { useEffect, useState, useCallback } from 'react'
import { Modal, Button, Form, Spinner } from 'react-bootstrap'
import Cropper from 'react-easy-crop'
import { cropImageFile } from '../../utils/images'

// Lets the user frame a picked image before upload: drag to move, slider or
// pinch/scroll to zoom. Calls onConfirm(croppedFile) or onCancel().
export default function ImageCropModal({ file, aspect = 1, round = false, outputWidth = 1600, title = 'Adjust picture', onConfirm, onCancel }) {
  const [url, setUrl] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Create and revoke the object URL in the same effect, so StrictMode's
  // mount/cleanup/mount cycle can't leave us holding a revoked URL.
  useEffect(() => {
    setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null); setError('')
    if (!file) { setUrl(null); return undefined }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const onComplete = useCallback((_, pixels) => setArea(pixels), [])

  const confirm = async () => {
    if (!area) return
    setBusy(true)
    setError('')
    try {
      onConfirm(await cropImageFile(file, area, outputWidth))
    } catch (err) {
      setError(err.message || 'Could not crop that image')
      setBusy(false)
    }
  }

  return (
    <Modal show={!!file} onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!busy}><Modal.Title>{title}</Modal.Title></Modal.Header>
      <Modal.Body>
        <div style={{ position: 'relative', height: 320, background: '#222', borderRadius: 6, overflow: 'hidden' }}>
          {url && (
            <Cropper image={url} crop={crop} zoom={zoom} aspect={aspect}
              cropShape={round ? 'round' : 'rect'} showGrid={!round}
              onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete} />
          )}
        </div>
        <Form.Group className="mt-3">
          <Form.Label className="small mb-1">Zoom</Form.Label>
          <Form.Range min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </Form.Group>
        <div className="small text-muted">Drag the picture to move it. Pinch or scroll to zoom.</div>
        {error && <div className="text-danger small mt-2">{error}</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={confirm} disabled={busy || !area}>
          {busy ? <Spinner animation="border" size="sm" /> : 'Use this crop'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
