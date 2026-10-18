import { createContext, useState, useEffect, useCallback, useRef } from 'react'
import * as api from '../api'

export const AppContext = createContext()

let toastId = 0

const emptyData = {
  members: [],
  chores: [],
  bulletinPosts: [],
  homeworkItems: [],
  snacks: [],
  stats: null,
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [family, setFamily] = useState(null)
  const [currentMember, setCurrentMember] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const toastTimers = useRef({})

  const loadSession = useCallback(async () => {
    try {
      const me = await api.authMe()
      setUser(me.user)
      setFamily(me.family || null)
      setCurrentMember(me.activeMember || null)
    } catch {
      setUser(null); setFamily(null); setCurrentMember(null)
    } finally {
      setAuthReady(true)
    }
  }, [])

  useEffect(() => { loadSession() }, [loadSession])

  const loadData = useCallback(async () => {
    if (!user || !currentMember) { setData(emptyData); return }
    setLoading(true)
    try {
      const [members, chores, bulletinPosts, homeworkItems, snacks, stats] = await Promise.all([
        api.fetchMembers(), api.fetchChores(), api.fetchBulletinPosts(),
        api.fetchHomework(), api.fetchSnacks(), api.fetchStats(),
      ])
      setData({ members, chores, bulletinPosts, homeworkItems, snacks, stats })
    } catch (err) {
      if (err?.status === 401) {
        setUser(null); setFamily(null); setCurrentMember(null)
      }
    } finally {
      setLoading(false)
    }
  }, [user, currentMember])

  useEffect(() => { loadData() }, [loadData])

  // Auth actions
  const register = async (payload) => {
    const resp = await api.authRegister(payload)
    await loadSession()
    return resp // includes one-time recoveryCodes
  }
  const login = async (payload) => {
    await api.authLogin(payload)
    await loadSession()
  }
  const logout = async () => {
    try { await api.authLogout() } catch { /* ignore */ }
    setUser(null); setFamily(null); setCurrentMember(null)
    setData(emptyData)
  }
  const selectMember = async (memberId, pin) => {
    const resp = await api.authSelectMember(memberId, pin)
    setCurrentMember(resp.activeMember)
  }
  const switchMember = async () => {
    try { await api.authClearActiveMember() } catch { /* ignore */ }
    setCurrentMember(null)
  }

  const refresh = () => loadData()

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (toastTimers.current[id]) {
      clearTimeout(toastTimers.current[id]); delete toastTimers.current[id]
    }
  }, [])

  const notify = useCallback((message, variant = 'info', duration = 3500) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, variant }])
    toastTimers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      delete toastTimers.current[id]
    }, duration)
    return id
  }, [])

  const isParent = currentMember?.role === 'parent'

  const value = {
    ...data,
    user, family, currentMember, isParent,
    authReady, loading,
    register, login, logout, selectMember, switchMember, refresh,
    toasts, notify, dismissToast,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export default AppContext
