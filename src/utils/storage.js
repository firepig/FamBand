export function getCurrentMemberId() {
  return localStorage.getItem('famBandCurrentMember') || null
}

export function setCurrentMemberId(id) {
  localStorage.setItem('famBandCurrentMember', id)
}

export function getLocalData(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setLocalData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — silently fail
  }
}
