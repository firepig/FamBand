import { useState, useEffect, useContext, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Badge,
  Spinner,
} from 'react-bootstrap';
import {
  FaTrophy,
  FaFire,
  FaCrown,
  FaMedal,
  FaAward,
} from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchPoints } from '../../api';
import Avatar from '../common/Avatar';

function hasStreak(chores, memberId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  let completedToday = false;
  let completedYesterday = false;

  chores.forEach((c) => {
    if (c.status !== 'done') return;
    const assigneeIds = (c.assignments || c.assignedTo || []).map((a) => (typeof a === 'object' ? a.id : a));
    if (!assigneeIds.includes(memberId)) return;

    const completedDate = c.completedAt || c.updatedAt || c.createdAt;
    if (!completedDate) return;
    const d = new Date(completedDate);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (day.getTime() === today.getTime()) completedToday = true;
    if (day.getTime() === yesterday.getTime()) completedYesterday = true;
  });

  return completedToday && completedYesterday;
}

function getMemberWeeklyCompletions(chores, memberId) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return chores.filter((c) => {
    if (c.status !== 'done') return false;
    const assigneeIds = (c.assignments || c.assignedTo || []).map((a) => (typeof a === 'object' ? a.id : a));
    if (!assigneeIds.includes(memberId)) return false;
    const completedDate = c.completedAt || c.updatedAt || c.createdAt;
    if (!completedDate) return false;
    return new Date(completedDate) >= startOfWeek;
  }).length;
}

function getLevel(points) {
  return Math.floor(points / 100) + 1;
}

export default function Leaderboard() {
  const { members, currentMember, chores, loading } = useContext(AppContext);
  const [pointsMap, setPointsMap] = useState({});
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [animatedPoints, setAnimatedPoints] = useState({});
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    if (members.length === 0) return;
    let cancelled = false;
    setLoadingPoints(true);

    Promise.all(
      members.map(async (m) => {
        try {
          const data = await fetchPoints(m.id);
          return { id: m.id, balance: data.balance ?? 0 };
        } catch {
          return { id: m.id, balance: 0 };
        }
      })
    )
      .then((results) => {
        if (cancelled) return;
        const map = {};
        results.forEach((r) => {
          map[r.id] = r.balance;
        });
        setPointsMap(map);
        setLoadingPoints(false);

        // Start count-up animation
        const start = {};
        members.forEach((m) => {
          start[m.id] = 0;
        });
        setAnimatedPoints(start);

        const duration = 1500;
        const interval = 30;
        const steps = duration / interval;
        let step = 0;

        const timer = setInterval(() => {
          step += 1;
          if (step >= steps) {
            clearInterval(timer);
            setAnimatedPoints(map);
            setAnimationDone(true);
            return;
          }
          const progress = step / steps;
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          const next = {};
          members.forEach((m) => {
            const target = map[m.id] || 0;
            next[m.id] = Math.round(target * eased);
          });
          setAnimatedPoints(next);
        }, interval);

        return () => clearInterval(timer);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingPoints(false);
          setAnimationDone(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [members]);

  const rankedChildren = useMemo(() => {
    const children = members.filter((m) => m.role === 'child');
    return children
      .map((m) => ({
        ...m,
        points: pointsMap[m.id] ?? 0,
        weeklyCompletions: getMemberWeeklyCompletions(chores || [], m.id),
        streak: hasStreak(chores || [], m.id),
      }))
      .sort((a, b) => b.points - a.points);
  }, [members, pointsMap, chores]);

  const parents = useMemo(() => {
    return members.filter((m) => m.role === 'parent');
  }, [members]);

  const mvpOfWeek = useMemo(() => {
    if (rankedChildren.length === 0) return null;
    const maxCompletions = Math.max(...rankedChildren.map((m) => m.weeklyCompletions));
    if (maxCompletions === 0) return null;
    return rankedChildren.find((m) => m.weeklyCompletions === maxCompletions);
  }, [rankedChildren]);

  const getRankStyle = (rank) => {
    switch (rank) {
      case 1:
        return {
          background: 'linear-gradient(135deg, #fff9c4 0%, #ffd54f 100%)',
          border: '2px solid #ffb300',
        };
      case 2:
        return {
          background: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
          border: '2px solid #bdbdbd',
        };
      case 3:
        return {
          background: 'linear-gradient(135deg, #fff3e0 0%, #ffcc80 100%)',
          border: '2px solid #ff9800',
        };
      default:
        return {
          background: '#ffffff',
          border: '1px solid #eee',
        };
    }
  };

  const getRankBadge = (rank) => {
    switch (rank) {
      case 1:
        return <FaTrophy size={28} className="text-warning" />;
      case 2:
        return (
          <span style={{ fontSize: '1.5rem' }}>
            🥈
          </span>
        );
      case 3:
        return (
          <span style={{ fontSize: '1.5rem' }}>
            🥉
          </span>
        );
      default:
        return (
          <span className="fw-bold text-muted" style={{ fontSize: '1.2rem' }}>
            #{rank}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <Card className="shadow-sm">
        <Card.Body className="text-center py-4">
          <Spinner animation="border" variant="warning" />
        </Card.Body>
      </Card>
    );
  }

  if (members.length === 0) {
    return (
      <Card className="shadow-sm">
        <Card.Body className="text-center py-4">
          <FaTrophy size={40} className="text-muted mb-2" />
          <p className="text-muted mb-0">No members yet. Add your family to start the leaderboard!</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <Card.Header
        className="fw-bold fs-5 d-flex align-items-center gap-2"
        style={{
          background: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
          color: '#fff',
        }}
      >
        <FaTrophy />
        <span>Leaderboard</span>
        {mvpOfWeek && (
          <Badge bg="light" text="dark" className="ms-auto d-flex align-items-center gap-1" pill>
            <FaAward className="text-warning" />
            MVP: <Avatar avatar={mvpOfWeek.avatar} /> {mvpOfWeek.name}
          </Badge>
        )}
      </Card.Header>
      <Card.Body className="p-0">
        {loadingPoints && Object.keys(animatedPoints).length === 0 ? (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" variant="warning" />
            <p className="text-muted small mt-1">Ranking...</p>
          </div>
        ) : (
          <>
            {/* Parents section */}
            {parents.map((parent) => (
              <div
                key={parent.id}
                className="d-flex align-items-center px-3 py-2 border-bottom"
                style={{ backgroundColor: '#f8f9fa' }}
              >
                <div className="d-flex align-items-center justify-content-center" style={{ width: 48 }}>
                  <FaCrown size={20} className="text-warning" />
                </div>
                <div className="d-flex align-items-center gap-2 flex-grow-1">
                  <span style={{ fontSize: '1.8rem' }}><Avatar avatar={parent.avatar} /></span>
                  <div>
                    <div className="fw-semibold">{parent.name}</div>
                    <Badge bg="secondary" size="sm" pill>Parent</Badge>
                  </div>
                </div>
                <div className="text-end">
                  <div className="fw-bold">{animatedPoints[parent.id] ?? 0}</div>
                  <small className="text-muted">pts</small>
                </div>
              </div>
            ))}

            {parents.length > 0 && rankedChildren.length > 0 && (
              <div className="border-bottom" style={{ backgroundColor: '#e9ecef' }}>
                <small className="text-muted fw-semibold px-3 py-1 d-block">Kids</small>
              </div>
            )}

            {/* Ranked children */}
            {rankedChildren.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <FaTrophy size={32} className="mb-2 opacity-50" />
                <p className="mb-0">No kids in the family yet. Add children to start competing!</p>
              </div>
            ) : (
              rankedChildren.map((member, idx) => {
                const rank = idx + 1;
                const isCurrentMember = currentMember?.id === member.id;
                const animPoints = animatedPoints[member.id] ?? 0;
                const level = getLevel(animPoints);

                return (
                  <div
                    key={member.id}
                    className={`d-flex align-items-center px-3 py-2 border-bottom ${isCurrentMember ? 'fw-bold' : ''}`}
                    style={{
                      ...getRankStyle(rank),
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (rank > 3) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (rank > 3) {
                        e.currentTarget.style.background = '#ffffff';
                      }
                    }}
                  >
                    <div
                      className="d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 48 }}
                    >
                      {getRankBadge(rank)}
                    </div>

                    <div className="d-flex align-items-center gap-2 flex-grow-1">
                      <span
                        style={{
                          fontSize: rank === 1 ? '2rem' : '1.6rem',
                          transition: 'font-size 0.3s',
                        }}
                      >
                        <Avatar avatar={member.avatar} />
                      </span>
                      <div>
                        <div className={isCurrentMember ? 'fw-bold' : ''} style={{ fontSize: '0.95rem' }}>
                          {member.name}
                        </div>
                        <div className="d-flex align-items-center gap-1">
                          <Badge
                            bg="warning"
                            text="dark"
                            pill
                            style={{ fontSize: '0.65rem' }}
                          >
                            Lv.{level}
                          </Badge>
                          {member.streak && (
                            <Badge bg="danger" pill style={{ fontSize: '0.65rem' }} className="d-flex align-items-center gap-1">
                              <FaFire size={8} />
                              Streak
                            </Badge>
                          )}
                          {mvpOfWeek && mvpOfWeek.id === member.id && (
                            <Badge bg="info" pill style={{ fontSize: '0.65rem' }} className="d-flex align-items-center gap-1">
                              <FaAward size={8} />
                              MVP
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-end flex-shrink-0" style={{ minWidth: 60 }}>
                      <div
                        className={`fw-bold ${rank <= 3 ? 'fs-5' : ''}`}
                        style={{ color: rank === 1 ? '#f57f17' : rank === 2 ? '#616161' : rank === 3 ? '#e65100' : '#333' }}
                      >
                        {animPoints}
                      </div>
                      <small className="text-muted" style={{ fontSize: '0.65rem' }}>pts</small>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
