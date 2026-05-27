import { useState, useEffect, useContext, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Spinner,
  Badge,
} from 'react-bootstrap';
import {
  FaChartBar,
  FaChartPie,
  FaFire,
  FaClock,
  FaStar,
  FaTrophy,
} from 'react-icons/fa';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import AppContext from '../../context/AppContext';
import { fetchStats } from '../../api';

const DARK_TEXT = '#333';
const MUTED_TEXT = '#888';

function CustomPieLabel({ cx, cy }) {
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: '0.85rem', fontWeight: 600, fill: MUTED_TEXT }}
    >
      Total Points
    </text>
  );
}

const STATUS_COLORS = {
  todo: '#ffc107',
  in_progress: '#0d6efd',
  done: '#198754',
};

function computeChoreStatusData(members, chores) {
  const memberChoreCount = {};
  members.forEach((m) => {
    if (m.role === 'child') {
      memberChoreCount[m.name] = { name: m.name, todo: 0, in_progress: 0, done: 0, color: m.color };
    }
  });

  chores.forEach((chore) => {
    const assigns = chore.assignments || chore.assignedTo || [];
    assigns.forEach((a) => {
      const memberId = typeof a === 'object' ? a.id : a;
      const member = members.find((m) => m.id === memberId);
      if (member && member.role === 'child' && memberChoreCount[member.name]) {
        if (chore.status === 'todo') memberChoreCount[member.name].todo += 1;
        else if (chore.status === 'in_progress') memberChoreCount[member.name].in_progress += 1;
        else if (chore.status === 'done') memberChoreCount[member.name].done += 1;
      }
    });
  });

  return Object.values(memberChoreCount);
}

function countChoresCompletedPastDays(chores, days) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // Use created_at as proxy for completion date since we don't have completion_date
  // Filter for done status and recent
  return chores.filter(
    (c) => c.status === 'done' && c.createdAt && new Date(c.createdAt) >= cutoff
  ).length;
}

function countOverdue(chores) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return chores.filter((c) => {
    if (!c.dueDate || c.status === 'done') return false;
    const due = new Date(c.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < now;
  }).length;
}

function getTopStreaker(chores, members) {
  const memberCounts = {};
  members.filter((m) => m.role === 'child').forEach((m) => {
    memberCounts[m.id] = 0;
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  chores.forEach((c) => {
    if (c.status !== 'done' || !c.createdAt) return;
    const created = new Date(c.createdAt);
    if (created >= sevenDaysAgo && created <= now) {
      (c.assignments || c.assignedTo || []).forEach((a) => {
        const mid = typeof a === 'object' ? a.id : a;
        if (memberCounts[mid] !== undefined) {
          memberCounts[mid] += 1;
        }
      });
    }
  });

  let topId = null;
  let topCount = 0;
  Object.entries(memberCounts).forEach(([id, count]) => {
    if (count > topCount) {
      topCount = count;
      topId = id;
    }
  });

  const topMember = members.find((m) => m.id === topId);
  return topMember ? { member: topMember, count: topCount } : null;
}

function getMostOverdue(chores, members) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdueCounts = {};
  members.filter((m) => m.role === 'child').forEach((m) => {
    overdueCounts[m.id] = 0;
  });

  chores.forEach((c) => {
    if (!c.dueDate || c.status === 'done') return;
    const due = new Date(c.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < now) {
      (c.assignments || c.assignedTo || []).forEach((a) => {
        const mid = typeof a === 'object' ? a.id : a;
        if (overdueCounts[mid] !== undefined) {
          overdueCounts[mid] += 1;
        }
      });
    }
  });

  let topId = null;
  let topCount = 0;
  Object.entries(overdueCounts).forEach(([id, count]) => {
    if (count > topCount) {
      topCount = count;
      topId = id;
    }
  });

  const topMember = members.find((m) => m.id === topId);
  return topMember ? { member: topMember, count: topCount } : null;
}

export default function Charts() {
  const { members, chores, loading } = useContext(AppContext);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    fetchStats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setStatsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choresByMember = useMemo(() => {
    if (!stats?.choresByMember) return [];
    return stats.choresByMember.map((item) => ({
      name: item.name,
      count: item.count,
      fill: item.color || '#0d6efd',
    }));
  }, [stats]);

  const pointsByMember = useMemo(() => {
    if (!stats?.pointsByMember) return [];
    return stats.pointsByMember
      .filter((m) => {
        const member = members.find((mm) => mm.id === m.id);
        return member && member.role === 'child';
      })
      .map((item) => ({
        name: item.name,
        value: Math.max(0, item.balance ?? 0),
        color: item.color || '#6c757d',
      }));
  }, [stats, members]);

  const choreStatusData = useMemo(() => {
    return computeChoreStatusData(members, chores || []);
  }, [members, chores]);

  const totalPoints = useMemo(() => {
    if (!stats?.pointsByMember) return 0;
    return stats.pointsByMember.reduce((sum, m) => sum + Math.max(0, m.balance ?? 0), 0);
  }, [stats]);

  const completionRate = useMemo(() => {
    if (!chores || chores.length === 0) return 0;
    const done = chores.filter((c) => c.status === 'done').length;
    return Math.round((done / chores.length) * 100);
  }, [chores]);

  const topStreaker = useMemo(() => getTopStreaker(chores || [], members), [chores, members]);
  const mostOverdue = useMemo(() => getMostOverdue(chores || [], members), [chores, members]);

  if (loading || statsLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="warning" />
        <p className="text-muted mt-2">Loading stats...</p>
      </div>
    );
  }

  const isEmpty = chores.length === 0;

  return (
    <Row className="g-3">
      {/* Chart 1: Chores Completed by Member */}
      <Col xs={12} md={6}>
        <Card className="shadow-sm h-100">
          <Card.Header className="fw-bold d-flex align-items-center gap-2" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff' }}>
            <FaChartBar />
            <span>Chores Completed by Member</span>
          </Card.Header>
          <Card.Body>
            {isEmpty || choresByMember.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <FaChartBar size={40} className="mb-2 opacity-50" />
                <p className="mb-0">No completed chores yet. Get started!</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={choresByMember} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fill: MUTED_TEXT, fontSize: 12 }} />
                  <YAxis tick={{ fill: MUTED_TEXT, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}
                    formatter={(value, name) => [value, 'Chores']}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {choresByMember.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card.Body>
        </Card>
      </Col>

      {/* Chart 2: Points Distribution (Donut) */}
      <Col xs={12} md={6}>
        <Card className="shadow-sm h-100">
          <Card.Header className="fw-bold d-flex align-items-center gap-2" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: '#fff' }}>
            <FaChartPie />
            <span>Points Distribution</span>
          </Card.Header>
          <Card.Body>
            {isEmpty || pointsByMember.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <FaChartPie size={40} className="mb-2 opacity-50" />
                <p className="mb-0">No points earned yet. Start completing chores!</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pointsByMember}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={3}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {pointsByMember.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}
                    formatter={(value) => [`${value} pts`, 'Points']}
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value) => <span style={{ color: DARK_TEXT, fontSize: 12 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card.Body>
        </Card>
      </Col>

      {/* Chart 3: Chore Status Breakdown */}
      <Col xs={12} md={6}>
        <Card className="shadow-sm h-100">
          <Card.Header className="fw-bold d-flex align-items-center gap-2" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: '#fff' }}>
            <FaChartBar />
            <span>Chore Status Breakdown</span>
          </Card.Header>
          <Card.Body>
            {isEmpty || choreStatusData.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <FaChartBar size={40} className="mb-2 opacity-50" />
                <p className="mb-0">No chores assigned yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={choreStatusData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fill: MUTED_TEXT, fontSize: 12 }} />
                  <YAxis tick={{ fill: MUTED_TEXT, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}
                  />
                  <Legend />
                  <Bar dataKey="todo" name="To Do" stackId="a" fill={STATUS_COLORS.todo} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="in_progress" name="In Progress" stackId="a" fill={STATUS_COLORS.in_progress} />
                  <Bar dataKey="done" name="Done" stackId="a" fill={STATUS_COLORS.done} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card.Body>
        </Card>
      </Col>

      {/* Chart 4: Fun Stats Card */}
      <Col xs={12} md={6}>
        <Card className="shadow-sm h-100">
          <Card.Header className="fw-bold d-flex align-items-center gap-2" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: '#fff' }}>
            <FaStar />
            <span>Fun Stats</span>
          </Card.Header>
          <Card.Body className="d-flex flex-column justify-content-center">
            {isEmpty ? (
              <div className="text-center py-4 text-muted">
                <FaStar size={40} className="mb-2 opacity-50" />
                <p className="mb-0">No data yet. Complete chores to see fun stats!</p>
              </div>
            ) : (
              <Row className="g-3">
                <Col xs={6}>
                  <div className="text-center p-3 rounded-3" style={{ backgroundColor: '#fff3e0' }}>
                    <FaFire size={24} className="text-danger mb-1" />
                    <div className="fw-bold" style={{ fontSize: '0.85rem' }}>Hottest Streaker</div>
                    <div className="mt-1">
                      {topStreaker ? (
                        <>
                          <span style={{ fontSize: '1.5rem' }}>{topStreaker.member.avatar || '👤'}</span>
                          <div className="small fw-semibold">{topStreaker.member.name}</div>
                          <Badge bg="danger" pill>{topStreaker.count} done</Badge>
                        </>
                      ) : (
                        <small className="text-muted">No one yet</small>
                      )}
                    </div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="text-center p-3 rounded-3" style={{ backgroundColor: '#fce4ec' }}>
                    <FaClock size={24} className="text-danger mb-1" />
                    <div className="fw-bold" style={{ fontSize: '0.85rem' }}>Most Overdue</div>
                    <div className="mt-1">
                      {mostOverdue ? (
                        <>
                          <span style={{ fontSize: '1.5rem' }}>{mostOverdue.member.avatar || '👤'}</span>
                          <div className="small fw-semibold">{mostOverdue.member.name}</div>
                          <Badge bg="danger" pill>{mostOverdue.count} overdue</Badge>
                        </>
                      ) : (
                        <small className="text-muted">None overdue!</small>
                      )}
                    </div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="text-center p-3 rounded-3" style={{ backgroundColor: '#e8f5e9' }}>
                    <FaStar size={24} className="text-warning mb-1" />
                    <div className="fw-bold" style={{ fontSize: '0.85rem' }}>Total Family Points</div>
                    <div className="fw-bold mt-1" style={{ fontSize: '1.8rem', color: '#2e7d32' }}>
                      {totalPoints}
                    </div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="text-center p-3 rounded-3" style={{ backgroundColor: '#e3f2fd' }}>
                    <FaTrophy size={24} className="text-warning mb-1" />
                    <div className="fw-bold" style={{ fontSize: '0.85rem' }}>Completion Rate</div>
                    <div className="fw-bold mt-1" style={{ fontSize: '1.8rem', color: '#1565c0' }}>
                      {completionRate}%
                    </div>
                  </div>
                </Col>
              </Row>
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
