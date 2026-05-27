import { useState, useEffect, useContext, useCallback } from 'react';
import { Card, Row, Col, ProgressBar, Spinner } from 'react-bootstrap';
import { FaCrown, FaStar, FaCoins } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchPoints } from '../../api';

const LEVEL_BASE = 100;

function getLevel(points) {
  return Math.floor(points / LEVEL_BASE) + 1;
}

function getLevelProgress(points) {
  const progress = (points % LEVEL_BASE) / LEVEL_BASE;
  return Math.min(Math.max(progress, 0), 1) * 100;
}

export default function PointsBar() {
  const { members, currentMember, stats, loading } = useContext(AppContext);
  const [pointsMap, setPointsMap] = useState({});
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [animatingId, setAnimatingId] = useState(null);

  const loadAllPoints = useCallback(async () => {
    setLoadingPoints(true);
    const map = {};
    try {
      const results = await Promise.all(
        members.map(async (m) => {
          try {
            const data = await fetchPoints(m.id);
            return { id: m.id, balance: data.balance ?? 0 };
          } catch {
            return { id: m.id, balance: 0 };
          }
        })
      );
      results.forEach((r) => {
        map[r.id] = r.balance;
      });
    } catch {
      members.forEach((m) => {
        map[m.id] = 0;
      });
    }
    setPointsMap(map);
    setLoadingPoints(false);
  }, [members]);

  useEffect(() => {
    if (members.length > 0) {
      loadAllPoints();
    }
  }, [loadAllPoints, members.length]);

  // Re-fetch when stats changes (e.g. after a chore is completed)
  useEffect(() => {
    if (stats) {
      loadAllPoints();
    }
  }, [stats]);

  // Animate points change
  useEffect(() => {
    if (!loadingPoints && Object.keys(pointsMap).length > 0) {
      // Trigger coin bounce animation on any point card
      setAnimatingId(Date.now());
    }
  }, [pointsMap, loadingPoints]);

  const children = members.filter((m) => m.role === 'child');
  const parents = members.filter((m) => m.role === 'parent');

  if (loading || (loadingPoints && members.length > 0)) {
    return (
      <div className="text-center py-3">
        <Spinner animation="border" variant="warning" />
        <p className="text-muted small mt-1">Loading points...</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <Card className="shadow-sm text-center p-4">
        <Card.Body>
          <FaCoins size={40} className="text-muted mb-2" />
          <p className="text-muted mb-0">No family members yet. Add some to start tracking points!</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Row className="g-2 align-items-stretch">
      {children.map((member) => {
        const points = pointsMap[member.id] ?? 0;
        const level = getLevel(points);
        const levelProgress = getLevelProgress(points);

        return (
          <Col xs={6} sm={4} md={3} lg={2} key={member.id}>
            <Card
              className="shadow-sm h-100 position-relative overflow-hidden"
              style={{
                borderLeft: `4px solid ${member.color || '#6c757d'}`,
                background: `linear-gradient(135deg, ${member.color}15 0%, #ffffff 80%)`,
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              <Card.Body className="text-center p-3">
                <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>
                  {member.avatar || '👤'}
                </div>
                <div className="fw-bold mt-1" style={{ fontSize: '0.85rem', color: member.color || '#333' }}>
                  {member.name}
                </div>
                <div className={`d-flex align-items-center justify-content-center gap-1 mt-1 ${animatingId ? 'coin-bounce' : ''}`}>
                  <FaStar className="text-warning" size={14} />
                  <span
                    className="fw-bold"
                    style={{ fontSize: '1.3rem', color: '#333' }}
                  >
                    {points}
                  </span>
                </div>
                <div className="mt-1">
                  <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                    Level {level}
                  </small>
                  <ProgressBar
                    now={levelProgress}
                    variant="warning"
                    style={{ height: 4, borderRadius: 2 }}
                    className="mt-1"
                  />
                  <small className="text-muted" style={{ fontSize: '0.6rem' }}>
                    {levelProgress.toFixed(0)}% to next level
                  </small>
                </div>
              </Card.Body>
            </Card>
          </Col>
        );
      })}

      {parents.map((parent) => {
        const points = pointsMap[parent.id] ?? 0;
        return (
          <Col xs={6} sm={4} md={3} lg={2} key={parent.id}>
            <Card
              className="shadow-sm h-100"
              style={{
                borderLeft: `4px solid ${parent.color || '#6c757d'}`,
                background: '#f8f9fa',
              }}
            >
              <Card.Body className="text-center p-3">
                <div style={{ fontSize: '2rem', lineHeight: 1 }}>
                  {parent.avatar || '👤'}
                </div>
                <div className="fw-bold mt-1" style={{ fontSize: '0.85rem', color: parent.color || '#333' }}>
                  {parent.name}
                </div>
                <div className="mt-1">
                  <FaCrown className="text-warning" size={18} />
                </div>
                <div className="d-flex align-items-center justify-content-center gap-1 mt-1">
                  <FaStar className="text-warning" size={10} />
                  <small className="fw-semibold">{points}</small>
                </div>
              </Card.Body>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
