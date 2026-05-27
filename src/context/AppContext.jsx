import { createContext, useState, useEffect, useCallback, useRef } from 'react'
import * as api from '../api'
import { getCurrentMemberId, setCurrentMemberId, getLocalData, setLocalData } from '../utils/storage'

export const AppContext = createContext()

let toastId = 0

export function AppProvider({ children }) {
  const [members, setMembers] = useState([])
  const [chores, setChores] = useState([])
  const [bulletinPosts, setBulletinPosts] = useState([])
  const [homeworkItems, setHomeworkItems] = useState([])
  const [snacks, setSnacks] = useState([])
  const [stats, setStats] = useState(null)
  const [currentMember, setCurrentMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])
  const toastTimers = useRef({})

  const loadData = useCallback(async () => {
    try {
      const [membersData, choresData, bulletinData, homeworkData, snacksData, statsData] =
        await Promise.all([
          api.fetchMembers(),
          api.fetchChores(),
          api.fetchBulletinPosts(),
          api.fetchHomework(),
          api.fetchSnacks(),
          api.fetchStats(),
        ])
      setMembers(membersData)
      setChores(choresData)
      setBulletinPosts(bulletinData)
      setHomeworkItems(homeworkData)
      setSnacks(snacksData)
      setStats(statsData)
      setLocalData('members', membersData)
      setLocalData('chores', choresData)
    } catch (err) {
      const localMembers = getLocalData('members')
      const localChores = getLocalData('chores')
      if (localMembers) setMembers(localMembers)
      if (localChores) setChores(localChores)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (members.length > 0 && !currentMember) {
      const storedId = getCurrentMemberId()
      const member = storedId
        ? members.find((m) => m.id === storedId)
        : members.find((m) => m.role === 'parent')
      if (member) {
        setCurrentMember(member)
        setCurrentMemberId(member.id)
      }
    }
  }, [members, currentMember])

  const switchMember = (memberId) => {
    const member = members.find((m) => m.id === memberId)
    if (member) {
      setCurrentMember(member)
      setCurrentMemberId(memberId)
    }
  }

  const refresh = () => loadData()

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (toastTimers.current[id]) {
      clearTimeout(toastTimers.current[id])
      delete toastTimers.current[id]
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
    members,
    chores,
    bulletinPosts,
    homeworkItems,
    snacks,
    stats,
    currentMember,
    isParent,
    loading,
    refresh,
    switchMember,
    toasts,
    notify,
    dismissToast,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export default AppContext
