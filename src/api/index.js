const BASE_URL = ''

function getStoredMemberId() {
  return localStorage.getItem('famBandCurrentMember')
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Family-Member': getStoredMemberId() || '',
  }
}

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: getHeaders(),
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || data.message || res.statusText || 'Request failed')
    }
    return data
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error('Network error: unable to connect to server')
    }
    throw err
  }
}

// Members
export async function fetchMembers() {
  return apiFetch('/api/members')
}

export async function createMember(data) {
  return apiFetch('/api/members', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Chores
export async function fetchChores(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiFetch(`/api/chores${query}`)
}

export async function createChore(data) {
  return apiFetch('/api/chores', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateChore(id, data) {
  return apiFetch(`/api/chores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteChore(id) {
  return apiFetch(`/api/chores/${id}`, {
    method: 'DELETE',
  })
}

export async function addChecklistItem(choreId, data) {
  return apiFetch(`/api/chores/${choreId}/checklist`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function toggleChecklistItem(choreId, itemId) {
  return apiFetch(`/api/chores/${choreId}/checklist/${itemId}`, {
    method: 'PATCH',
  })
}

export async function uploadPhoto(choreId, file) {
  try {
    const formData = new FormData()
    formData.append('photo', file)
    const res = await fetch(`${BASE_URL}/api/chores/${choreId}/photo`, {
      method: 'POST',
      headers: {
        'X-Family-Member': getStoredMemberId() || '',
      },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || data.message || res.statusText || 'Upload failed')
    }
    return data
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error('Network error: unable to connect to server')
    }
    throw err
  }
}

export async function approveChore(choreId, approvedBy) {
  return apiFetch(`/api/chores/${choreId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approvedBy }),
  })
}

export async function rejectChore(choreId) {
  return apiFetch(`/api/chores/${choreId}/reject`, {
    method: 'POST',
  })
}

// Points
export async function fetchPoints(memberId) {
  return apiFetch(`/api/points/${memberId}`)
}

export async function redeemSnack(memberId, snackId) {
  return apiFetch('/api/points/redeem', {
    method: 'POST',
    body: JSON.stringify({ memberId, snackId }),
  })
}

// Bulletin
export async function fetchBulletinPosts() {
  return apiFetch('/api/bulletin')
}

export async function createBulletinPost(data) {
  return apiFetch('/api/bulletin', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteBulletinPost(id) {
  return apiFetch(`/api/bulletin/${id}`, {
    method: 'DELETE',
  })
}

// Homework
export async function fetchHomework(memberId) {
  const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : ''
  return apiFetch(`/api/homework${query}`)
}

export async function createHomework(data) {
  return apiFetch('/api/homework', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateHomework(id, data) {
  return apiFetch(`/api/homework/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// Snacks
export async function fetchSnacks() {
  return apiFetch('/api/snacks')
}

export async function createSnack(data) {
  return apiFetch('/api/snacks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSnack(id, data) {
  return apiFetch(`/api/snacks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function fetchSnackHistory(memberId) {
  return apiFetch(`/api/snacks/history/${memberId}`)
}

// Stats
export async function fetchStats() {
  return apiFetch('/api/stats')
}
