import { useContext } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Row, Col, Spinner } from 'react-bootstrap'
import { AppProvider, AppContext } from './context/AppContext'
import Layout from './components/layout/Layout'
import KanbanBoard from './components/board/KanbanBoard'
import BulletinBoard from './components/family/BulletinBoard'
import HomeworkChart from './components/family/HomeworkChart'
import SnackShop from './components/family/SnackShop'
import Charts from './components/gamification/Charts'
import Leaderboard from './components/gamification/Leaderboard'
import Achievements from './components/gamification/Achievements'
import History from './components/gamification/History'
import PointsBar from './components/gamification/PointsBar'
import Toaster from './components/common/Toaster'

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

function AppContent() {
  const { loading } = useContext(AppContext)
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
        <Spinner animation="border" variant="warning" />
        <span className="ms-3 fs-5 rt-blink" style={{ fontFamily: 'var(--rt-font-display)' }}>
          LOADING...
        </span>
      </div>
    )
  }
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={
            <>
              <PointsBar />
              <KanbanBoard />
            </>
          } />
          <Route path="/bulletin" element={<BulletinBoard />} />
          <Route path="/homework" element={<HomeworkChart />} />
          <Route path="/snacks" element={<SnackShop />} />
          <Route path="/stats" element={<StatsPage />} />
        </Route>
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
