const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '')

async function apiFetch(url, options = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }).catch((err) => {
    if (err instanceof TypeError) throw new Error('Network error: unable to connect to server')
    throw err
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || res.statusText || 'Request failed')
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

// --- Auth ---
export async function authMe() {
  return apiFetch('/api/auth/me')
}
export async function authRegister(data) {
  return apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) })
}
export async function authLogin(data) {
  return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(data) })
}
export async function authLogout() {
  return apiFetch('/api/auth/logout', { method: 'POST' })
}
export async function authSelectMember(memberId, pin) {
  return apiFetch('/api/auth/select-member', { method: 'POST', body: JSON.stringify({ memberId, pin }) })
}
export async function authClearActiveMember() {
  return apiFetch('/api/auth/clear-active-member', { method: 'POST' })
}
export async function authResetPassword(data) {
  return apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(data) })
}
export async function authChangePassword(data) {
  return apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify(data) })
}
export async function authRegenerateRecoveryCodes() {
  return apiFetch('/api/auth/regenerate-recovery-codes', { method: 'POST' })
}

// --- Members ---
export async function fetchMembers() { return apiFetch('/api/members') }
export async function createMember(data) {
  return apiFetch('/api/members', { method: 'POST', body: JSON.stringify(data) })
}
export async function deleteMember(id) {
  return apiFetch(`/api/members/${id}`, { method: 'DELETE' })
}
export async function updateMember(id, data) {
  return apiFetch(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}
export async function uploadAvatar(id, file) {
  return uploadFile(`/api/members/${id}/avatar`, 'avatar', file)
}
export async function updateMemberPin(id, data) {
  return apiFetch(`/api/members/${id}/pin`, { method: 'PATCH', body: JSON.stringify(data) })
}

// --- Chores ---
export async function fetchChores(status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiFetch(`/api/chores${q}`)
}
export async function createChore(data) {
  return apiFetch('/api/chores', { method: 'POST', body: JSON.stringify(data) })
}
export async function updateChore(id, data) {
  return apiFetch(`/api/chores/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}
export async function deleteChore(id) {
  return apiFetch(`/api/chores/${id}`, { method: 'DELETE' })
}
export async function addChecklistItem(choreId, data) {
  return apiFetch(`/api/chores/${choreId}/checklist`, { method: 'POST', body: JSON.stringify(data) })
}
export async function toggleChecklistItem(choreId, itemId) {
  return apiFetch(`/api/chores/${choreId}/checklist/${itemId}`, { method: 'PATCH' })
}
// Multipart upload (no JSON content-type; the browser sets the boundary).
async function uploadFile(url, field, file) {
  const formData = new FormData()
  formData.append(field, file)
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  }).catch((err) => {
    if (err instanceof TypeError) throw new Error('Network error: unable to connect to server')
    throw err
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || res.statusText || 'Upload failed')
    err.status = res.status
    throw err
  }
  return data
}
export async function uploadPhoto(choreId, file) {
  return uploadFile(`/api/chores/${choreId}/photo`, 'photo', file)
}
export async function uploadQuestImage(file) {
  return uploadFile('/api/uploads/quest', 'image', file)
}
export async function claimChore(choreId) {
  return apiFetch(`/api/chores/${choreId}/claim`, { method: 'POST', body: JSON.stringify({}) })
}
export async function releaseChore(choreId) {
  return apiFetch(`/api/chores/${choreId}/release`, { method: 'POST', body: JSON.stringify({}) })
}
export async function duplicateChore(choreId, data = {}) {
  return apiFetch(`/api/chores/${choreId}/duplicate`, { method: 'POST', body: JSON.stringify(data) })
}
export async function approveChore(choreId) {
  return apiFetch(`/api/chores/${choreId}/approve`, { method: 'POST', body: JSON.stringify({}) })
}
export async function rejectChore(choreId) {
  return apiFetch(`/api/chores/${choreId}/reject`, { method: 'POST' })
}

// --- Templates ---
export async function fetchTemplates() { return apiFetch('/api/templates') }
export async function fetchTemplate(id) { return apiFetch(`/api/templates/${id}`) }
export async function createTemplateOverride(templateId, data) {
  return apiFetch(`/api/templates/${templateId}/overrides`, { method: 'POST', body: JSON.stringify(data) })
}
export async function deleteTemplateOverride(templateId, periodStart) {
  return apiFetch(`/api/templates/${templateId}/overrides/${periodStart}`, { method: 'DELETE' })
}
export async function makeChoreRepeating(choreId, data) {
  return apiFetch(`/api/chores/${choreId}/make-repeating`, { method: 'POST', body: JSON.stringify(data) })
}
export async function createTemplate(data) {
  return apiFetch('/api/templates', { method: 'POST', body: JSON.stringify(data) })
}
export async function updateTemplate(id, data) {
  return apiFetch(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}
export async function deleteTemplate(id) {
  return apiFetch(`/api/templates/${id}`, { method: 'DELETE' })
}

// --- Points ---
export async function fetchPoints(memberId) {
  return apiFetch(`/api/points/${memberId}`)
}
export async function redeemSnack(snackId) {
  return apiFetch('/api/points/redeem', { method: 'POST', body: JSON.stringify({ snackId }) })
}

export async function cashOut(blocks) {
  return apiFetch('/api/points/cash-out', { method: 'POST', body: JSON.stringify({ blocks }) })
}
export async function fetchCashOuts() { return apiFetch('/api/points/cash-outs') }
export async function markCashOutPaid(id) {
  return apiFetch(`/api/points/cash-outs/${id}/paid`, { method: 'POST', body: JSON.stringify({}) })
}

// --- Bulletin ---
export async function fetchBulletinPosts() { return apiFetch('/api/bulletin') }
export async function createBulletinPost(data) {
  return apiFetch('/api/bulletin', { method: 'POST', body: JSON.stringify(data) })
}
export async function deleteBulletinPost(id) {
  return apiFetch(`/api/bulletin/${id}`, { method: 'DELETE' })
}

// --- Homework ---
export async function fetchHomework(memberId) {
  const q = memberId ? `?memberId=${encodeURIComponent(memberId)}` : ''
  return apiFetch(`/api/homework${q}`)
}
export async function createHomework(data) {
  return apiFetch('/api/homework', { method: 'POST', body: JSON.stringify(data) })
}
export async function updateHomework(id, data) {
  return apiFetch(`/api/homework/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

// --- Snacks ---
export async function fetchSnacks() { return apiFetch('/api/snacks') }
export async function createSnack(data) {
  return apiFetch('/api/snacks', { method: 'POST', body: JSON.stringify(data) })
}
export async function updateSnack(id, data) {
  return apiFetch(`/api/snacks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}
export async function fetchSnackHistory(memberId) {
  return apiFetch(`/api/snacks/history/${memberId}`)
}

// --- Stats ---
export async function fetchStats() { return apiFetch('/api/stats') }
