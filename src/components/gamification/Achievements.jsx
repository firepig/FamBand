import { useState, useEffect, useContext, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Badge,
  Nav,
  Alert,
  Spinner,
} from 'react-bootstrap';
import {
  FaTrophy,
  FaLock,
  FaUnlock,
  FaStar,
  FaAward,
  FaMedal,
} from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchStats, fetchPoints } from '../../api';
import Confetti from '../common/Confetti';

const DEFAULT_ACHIEVEMENTS = [
  { id: 'ach-001', name: 'First Steps', description: 'Complete your first chore!', icon: '🌟', criteria: { type: 'chores_completed', threshold: 1 } },
  { id: 'ach-002', name: 'Chore Champ', description: 'Complete 10 chores', icon: '⭐', criteria: { type: 'chores_completed', threshold: 10 } },
  { id: 'ach-003', name: 'Point Collector', description: 'Earn 100 points', icon: '💰', criteria: { type: 'points_earned', threshold: 100 } },
  { id: 'ach-004', name: 'Streak Master', description: 'Maintain a 7 day streak', icon: '🔥', criteria: { type: 'streak', threshold: 7 } },
  { id: 'ach-005', name: 'Helper Hero', description: 'Complete 5 chores in one day', icon: '🦸', criteria: { type: 'daily_chores', threshold: 5 } },
  { id: 'ach-006', name: 'Snack Saver', description: 'Redeem your first snack', icon: '🍪', criteria: { type: 'snacks_redeemed', threshold: 1 } },
];

export default function Achievements() {
  const { members, currentMember, stats, loading } = useContext(AppContext);
  const [earnedMap, setEarnedMap] = useState({});
  const [loadingAchievements, setLoadingAchievements] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showConfetti, setShowConfetti] = useState(false);
  const [newAchievementName, setNewAchievementName] = useState('');
  const [showToast, setShowToast] = useState(false);

  // earnedMap: { achievementId: [{ memberId, memberName, memberAvatar, earnedAt }] }
  useEffect(() => {
    let cancelled = false;
    setLoadingAchievements(true);

    async function load() {
      try {
        const statsData = await fetchStats();
        if (cancelled) return;

        const map = {};
        const achievements = statsData.memberAchievements || [];

        achievements.forEach((entry) => {
          const achId = entry.achievement_id || entry.id;
          if (!map[achId]) {
            map[achId] = [];
          }
          const member = members.find((m) => m.id === entry.member_id);
          map[achId].push({
            memberId: entry.member_id,
            memberName: member?.name || entry.member_name || 'Unknown',
            memberAvatar: member?.avatar || entry.member_avatar || '👤',
            earnedAt: entry.earned_at,
          });
        });

        // Also fetch individual achievement data for current member
        if (currentMember) {
          try {
            const pointsData = await fetchPoints(currentMember.id);
            if (pointsData.achievements && !cancelled) {
              pointsData.achievements.forEach((entry) => {
                const achId = entry.achievement_id || entry.id;
                // Avoid duplicating all-family achievements from stats
                if (!map[achId]) {
                  map[achId] = [];
                }
                const alreadyExists = map[achId].some((e) => e.memberId === currentMember.id);
                if (!alreadyExists) {
                  map[achId].push({
                    memberId: currentMember.id,
                    memberName: currentMember.name,
                    memberAvatar: currentMember.avatar || '👤',
                    earnedAt: entry.earned_at,
                  });
                }
              });
            }
          } catch {
            // ignore individual fetch failure
          }
        }

        if (!cancelled) {
          setEarnedMap(map);

          // Check for newly earned achievements (if stats changed since last render)
          const prevEarned = sessionStorage.getItem('famBandLastEarnedAchievements');
          if (prevEarned) {
            const prev = JSON.parse(prevEarned);
            Object.keys(map).forEach((achId) => {
              if (!prev[achId] && map[achId].length > 0) {
                const ach = DEFAULT_ACHIEVEMENTS.find((a) => a.id === achId);
                if (ach) {
                  setNewAchievementName(ach.name);
                  setShowToast(true);
                  setShowConfetti(true);
                  setTimeout(() => {
                    setShowConfetti(false);
                  }, 3000);
                }
              }
            });
          }

          // Save current state for next comparison
          const currentState = {};
          Object.keys(map).forEach((achId) => {
            currentState[achId] = map[achId].length > 0;
          });
          sessionStorage.setItem('famBandLastEarnedAchievements', JSON.stringify(currentState));

          setLoadingAchievements(false);
        }
      } catch {
        if (!cancelled) {
          setLoadingAchievements(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [members, currentMember, stats]);

  const filteredAchievements = useMemo(() => {
    return DEFAULT_ACHIEVEMENTS.filter((ach) => {
      const earned = earnedMap[ach.id] && earnedMap[ach.id].length > 0;
      if (filter === 'earned') return earned;
      if (filter === 'locked') return !earned;
      return true;
    });
  }, [filter, earnedMap]);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  if (loading || loadingAchievements) {
    return (
      <Card className="shadow-sm">
        <Card.Body className="text-center py-5">
          <Spinner animation="border" variant="warning" />
          <p className="text-muted mt-2">Loading achievements...</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <>
      {showConfetti && <Confetti />}

      {showToast && (
        <Alert
          variant="success"
          className="position-fixed top-0 start-50 translate-middle-x mt-4 shadow-lg text-center"
          style={{ zIndex: 9999, minWidth: 300 }}
          dismissible
          onClose={() => setShowToast(false)}
        >
          <div className="fw-bold fs-5">Achievement Unlocked!</div>
          <div className="d-flex align-items-center justify-content-center gap-2 mt-1">
            <FaAward className="text-warning" size={20} />
            <span>{newAchievementName}</span>
          </div>
        </Alert>
      )}

      <Card className="shadow-sm">
        <Card.Header
          className="fw-bold fs-5 d-flex align-items-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
            color: '#fff',
          }}
        >
          <FaTrophy />
          <span>Achievements</span>
          <Badge bg="light" text="dark" className="ms-2" pill>
            {Object.keys(earnedMap).filter((k) => earnedMap[k].length > 0).length}/{DEFAULT_ACHIEVEMENTS.length}
          </Badge>
        </Card.Header>

        <Card.Body>
          <Nav
            variant="pills"
            className="mb-3 justify-content-center"
            activeKey={filter}
            onSelect={(k) => setFilter(k || 'all')}
          >
            <Nav.Item>
              <Nav.Link eventKey="all" className="d-flex align-items-center gap-1">
                <FaUnlock size={12} /> All
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="earned" className="d-flex align-items-center gap-1">
                <FaStar size={12} className="text-warning" /> Earned
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="locked" className="d-flex align-items-center gap-1">
                <FaLock size={12} /> Locked
              </Nav.Link>
            </Nav.Item>
          </Nav>

          {filteredAchievements.length === 0 && filter === 'earned' && (
            <div className="text-center py-4 text-muted">
              <FaAward size={40} className="mb-2 opacity-50" />
              <p className="mb-0">No achievements earned yet. Complete chores to unlock them!</p>
            </div>
          )}
          {filteredAchievements.length === 0 && filter === 'locked' && (
            <div className="text-center py-4 text-muted">
              <FaMedal size={40} className="mb-2 opacity-50" />
              <p className="mb-0">All achievements have been earned! Amazing!</p>
            </div>
          )}

          <Row className="g-3">
            {filteredAchievements.map((ach) => {
              const earned = earnedMap[ach.id] && earnedMap[ach.id].length > 0;
              const earners = earnedMap[ach.id] || [];

              return (
                <Col xs={12} sm={6} md={4} key={ach.id}>
                  <Card
                    className={`h-100 shadow-sm ${!earned ? 'opacity-50' : ''}`}
                    style={{
                      filter: earned ? 'none' : 'grayscale(0.8)',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {!earned && (
                      <div
                        className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                        style={{ zIndex: 2, backgroundColor: 'rgba(255,255,255,0.3)' }}
                      >
                        <FaLock size={32} className="text-muted" />
                      </div>
                    )}

                    {earned && earners.length > 0 && (
                      <div
                        className="position-absolute top-0 end-0 m-2"
                        style={{ zIndex: 1 }}
                      >
                        <Badge bg="success" pill className="d-flex align-items-center gap-1">
                          <FaStar size={8} />
                          Earned!
                        </Badge>
                      </div>
                    )}

                    <Card.Body
                      className={`text-center p-3 ${!earned ? '' : ''}`}
                      style={{
                        background: earned
                          ? 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, #ffffff 100%)'
                          : '#f8f9fa',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '3rem',
                          lineHeight: 1,
                          filter: earned ? 'none' : 'grayscale(1)',
                          transition: 'filter 0.3s',
                        }}
                      >
                        {ach.icon}
                      </div>
                      <div className="fw-bold mt-2" style={{ fontSize: '0.95rem' }}>
                        {ach.name}
                      </div>
                      <p className="text-muted small mb-2">{ach.description}</p>

                      {earned && earners.length > 0 && (
                        <div className="d-flex justify-content-center gap-1 mt-2 flex-wrap">
                          {earners.map((earner, ei) => (
                            <span
                              key={ei}
                              className="d-inline-flex align-items-center gap-1 small"
                              style={{
                                backgroundColor: '#e8f5e9',
                                borderRadius: '12px',
                                padding: '2px 8px',
                                fontSize: '0.75rem',
                              }}
                              title={earner.memberName}
                            >
                              {earner.memberAvatar} {earner.memberName}
                            </span>
                          ))}
                        </div>
                      )}

                      {!earned && (
                        <div className="mt-2">
                          <Badge bg="secondary" pill style={{ fontSize: '0.65rem' }}>
                            {ach.criteria.type === 'chores_completed'
                              ? `Complete ${ach.criteria.threshold} chore${ach.criteria.threshold > 1 ? 's' : ''}`
                              : ach.criteria.type === 'points_earned'
                              ? `Earn ${ach.criteria.threshold} points`
                              : ach.criteria.type === 'streak'
                              ? `${ach.criteria.threshold} day streak`
                              : ach.criteria.type === 'daily_chores'
                              ? `${ach.criteria.threshold} chores in a day`
                              : ach.criteria.type === 'snacks_redeemed'
                              ? `Redeem ${ach.criteria.threshold} snack${ach.criteria.threshold > 1 ? 's' : ''}`
                              : 'Keep going!'}
                          </Badge>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card.Body>
      </Card>
    </>
  );
}
