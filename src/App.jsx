import { useContext } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Row, Col, Spinner } from 'react-bootstrap'
import { AppProvider, AppContext } from './context/AppContext'
import Layout from './components/layout/Layout'
import KanbanBoard from './components/board/KanbanBoard'
import Billboard from './components/board/Billboard'
import BulletinBoard from './components/family/BulletinBoard'
import HomeworkChart from './components/family/HomeworkChart'
import SnackShop from './components/family/SnackShop'
import Charts from './components/gamification/Charts'
import Leaderboard from './components/gamification/Leaderboard'
import Achievements from './components/gamification/Achievements'
import History from './components/gamification/History'
import PointsBar from './components/gamification/PointsBar'
import Toaster from './components/common/Toaster'
import Login from './components/auth/Login'
import Register from './components/auth/Register'
import ForgotPassword from './components/auth/ForgotPassword'
import SelectMember from './components/auth/SelectMember'
import MemberManager from './components/family/MemberManager'
import Profile from './components/family/Profile'

function StatsPage() {
  return (
    <div>
      <h1 className="rt-page-title">SCOREBOARD</h1>
      <PointsBar />
      <Row className="mt-4 g-4">
        <Col lg={8}><Charts /></Col>
        <Col lg={4}><Leaderboard /></Col>
      </Row>
      <Row className="mt-4 g-4">
        <Col lg={6}><History /></Col>
        <Col lg={6}><Achievements /></Col>
      </Row>
    </div>
  )
}

function RequireUser({ children }) {
  const { user, authReady } = useContext(AppContext)
  const location = useLocation()
  if (!authReady) return <FullSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireActiveMember({ children }) {
  const { user, currentMember, authReady } = useContext(AppContext)
  if (!authReady) return <FullSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!currentMember) return <Navigate to="/select-member" replace />
  return children
}

function RequireParent({ children }) {
  const { isParent } = useContext(AppContext)
  if (!isParent) return <Navigate to="/" replace />
  return children
}

function FullSpinner() {
  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
      <Spinner animation="border" variant="warning" />
      <span className="ms-3 fs-5 rt-blink" style={{ fontFamily: 'var(--rt-font-display)' }}>
        LOADING...
      </span>
    </div>
  )
}

function AppContent() {
  const { authReady, loading, user, currentMember } = useContext(AppContext)
  if (!authReady) return <FullSpinner />

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/select-member" element={
          <RequireUser>{currentMember ? <Navigate to="/" replace /> : <SelectMember />}</RequireUser>
        } />

        <Route path="/billboard" element={<RequireUser><Billboard /></RequireUser>} />

        <Route element={<RequireActiveMember><Layout /></RequireActiveMember>}>
          <Route path="/" element={loading ? <FullSpinner /> : <><PointsBar /><KanbanBoard /></>} />
          <Route path="/bulletin" element={<BulletinBoard />} />
          <Route path="/homework" element={<HomeworkChart />} />
          <Route path="/snacks" element={<SnackShop />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/family" element={<RequireParent><MemberManager /></RequireParent>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
