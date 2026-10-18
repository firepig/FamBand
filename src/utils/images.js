// Client-side mirrors of the server's upload rules (server/lib/uploads.js).
// The server is the source of truth; these just give fast feedback.
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp'
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export const MAX_MB = { avatar: 2, quest: 5, photo: 5 }

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
