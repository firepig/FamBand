// Client-side mirrors of the server's upload rules (server/lib/uploads.js).
// The server is the source of truth; these just give fast feedback.
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp'
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export const MAX_MB = { avatar: 2, quest: 5, photo: 5 }
// Longest side, in pixels, that we resize down to before uploading.
export const MAX_DIM = { avatar: 512, quest: 1600, photo: 1600 }

// Returns an error string, or null when the file looks acceptable.
export function validateImageFile(file, maxMB) {
  if (!file) return 'No file selected'
  if (!ALLOWED.has(file.type)) return 'Use a JPEG, PNG, GIF or WebP image'
  if (file.size > maxMB * 1024 * 1024) return `Image is too large (max ${maxMB} MB)`
  return null
}

const AVATAR_IMG_PREFIX = 'img:'

export function isImageAvatar(avatar) {
  return typeof avatar === 'string' && avatar.startsWith(AVATAR_IMG_PREFIX)
}

// Public URL for an uploaded file in one of the served upload folders.
export function uploadUrl(dir, filename) {
  return `${import.meta.env.BASE_URL}${dir}/${filename}`
}

export function avatarImageUrl(avatar) {
  return uploadUrl('avatars', avatar.slice(AVATAR_IMG_PREFIX.length))
}

// Plain-text stand-in for places that can only show text (<option>, subtitles).
export function avatarText(avatar) {
  return !avatar || isImageAvatar(avatar) ? '👤' : avatar
}

function loadBitmap(file) {
  // 'from-image' applies EXIF rotation so phone photos aren't sideways.
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Encodes a canvas for upload. JPEG stays JPEG; everything else prefers WebP
// (keeps transparency). Browsers that can't encode WebP (Safari) silently hand
// back PNG, which is fine.
export async function canvasToFile(canvas, sourceType, sourceName) {
  const wanted = sourceType === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
  const blob = await canvasToBlob(canvas, wanted, 0.85)
  if (!blob) throw new Error('Could not process that image')
  const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[blob.type] || 'jpg'
  const base = (sourceName || 'image').replace(/\.[^.]+$/, '')
  return new File([blob], `${base}.${ext}`, { type: blob.type })
}

// Shrinks an image in the browser when it is larger than `kind` allows, either
// in pixels or bytes. Small images are returned untouched (no recompression).
// Animated GIFs are never touched, since a canvas would flatten them.
async function downscale(file, maxDim) {
  const bitmap = await loadBitmap(file)
  const w = bitmap.width
  const h = bitmap.height
  const scale = Math.min(1, maxDim / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (file.type === 'image/jpeg') {
    ctx.fillStyle = '#fff' // JPEG has no alpha
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  return canvasToFile(canvas, file.type, file.name)
}

// Validate, then resize if needed. Resolves to { file } ready to upload, or { error }.
export async function prepareImageForUpload(file, kind) {
  const maxMB = MAX_MB[kind]
  const maxDim = MAX_DIM[kind]
  if (!file) return { error: 'No file selected' }
  if (!ALLOWED.has(file.type)) return { error: 'Use a JPEG, PNG, GIF or WebP image' }

  let out = file
  if (file.type !== 'image/gif') {
    try {
      const bitmap = await loadBitmap(file)
      const tooBig = Math.max(bitmap.width, bitmap.height) > maxDim
      bitmap.close?.()
      if (tooBig || file.size > maxMB * 1024 * 1024) {
        const resized = await downscale(file, maxDim)
        // Never make a small file bigger just because we re-encoded it.
        out = resized.size < file.size || tooBig ? resized : file
      }
    } catch (err) {
      return { error: err.message || 'Could not read that image' }
    }
  }
  const problem = validateImageFile(out, maxMB)
  return problem ? { error: problem } : { file: out }
}

// Crops `file` to `area` ({x, y, width, height} in source pixels, as reported by
// react-easy-crop) and scales the result to at most `maxWidth` pixels wide.
export async function cropImageFile(file, area, maxWidth) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that image'))
      el.src = url
    })
    const outW = Math.max(1, Math.round(Math.min(maxWidth, area.width)))
    const outH = Math.max(1, Math.round(outW * (area.height / area.width)))
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (file.type === 'image/jpeg') {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, outW, outH)
    }
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH)
    return await canvasToFile(canvas, file.type, file.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Animated GIFs can't be cropped on a canvas without flattening them.
export function isCroppable(file) {
  return file.type !== 'image/gif'
}
