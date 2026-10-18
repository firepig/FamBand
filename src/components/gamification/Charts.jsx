import { useState, useEffect, useContext, useMemo } from 'react';
import { Card, Row, Col, Spinner } from 'react-bootstrap';
import { FaChartBar, FaChartPie, FaFire, FaClock, FaStar, FaTrophy } from 'react-icons/fa';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import AppContext from '../../context/AppContext';
import { fetchStats } from '../../api';

// Retro chart palette
const PALETTE = ['#ffcc00', '#4cc9f0', '#5af78e', '#ff7b29', '#b388ff', '#ff3864'];
const STATUS_COLORS = {
  todo:        '#4cc9f0',
  in_progress: '#ffcc00',
  done:        '#5af78e',
};
const AXIS_COLOR = '#a8a3c7';
const GRID_COLOR = '#2a2750';

const tooltipStyle = {
  background: '#1a1838',
  border: '3px solid #f4f1de',
  borderRadius: 0,
  color: '#f4f1de',
  fontFamily: 'VT323, monospace',
  boxShadow: '4px 4px 0 #0a0918',
};

function computeChoreStatusData(members, chores) {
  const out = {};
  members.forEach((m) => {
    if (m.role === 'child') out[m.name] = { name: m.name, todo: 0, in_progress: 0, done: 0 };
  });
  (chores || []).forEach((chore) => {
    if (chore.status === 'failed') return;
    const ids = (chore.assignments || chore.assignedTo || []).map((a) => (typeof a === 'object' ? a.id : a));
    ids.forEach((id) => {
      const m = members.find((mm) => mm.id === id);
      if (m?.role === 'child' && out[m.name]) {
        if (chore.status === 'todo') out[m.name].todo += 1;
        else if (chore.status === 'in_progress') out[m.name].in_progress += 1;
        else if (chore.status === 'done') out[m.name].done += 1;
      }
    });
  });
  return Object.values(out);
}

function getTopStreaker(chores, members) {
  const counts = {};
  members.filter((m) => m.role === 'child').forEach((m) => counts[m.id] = 0);
  const cutoff = new Date(Date.now() - 7 * 86400000);
  (chores || []).forEach((c) => {
    if (c.status !== 'done' || !c.createdAt) return;
    if (new Date(c.createdAt) < cutoff) return;
    (c.assignments || c.assignedTo || []).forEach((a) => {
      const id = typeof a === 'object' ? a.id : a;
      if (counts[id] !== undefined) counts[id] += 1;
    });
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] === 0) return null;
  const member = members.find((m) => m.id === top[0]);
  return member ? { member, count: top[1] } : null;
}

function getMostFailed(chores, members) {
  const counts = {};
  members.filter((m) => m.role === 'child').forEach((m) => counts[m.id] = 0);
  (chores || []).forEach((c) => {
    if (c.status !== 'failed') return;
    (c.assignments || c.assignedTo || []).forEach((a) => {
      const id = typeof a === 'object' ? a.id : a;
      if (counts[id] !== undefined) counts[id] += 1;
    });
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] === 0) return null;
  const member = members.find((m) => m.id === top[0]);
  return member ? { member, count: top[1] } : null;
}

function StatTile({ icon, label, value, color, sub }) {
  return (
    <div style={{
      padding: 14,
      border: `2px solid ${color}`,
      background: 'var(--rt-bg-3)',
      boxShadow: '3px 3px 0 0 var(--rt-border-dark)',
      textAlign: 'center',
      height: '100%',
    }}>
      <div style={{ color, marginBottom: 6 }}>{icon}</div>
      <div style={{
        fontFamily: 'var(--rt-font-display)',
        fontSize: '0.55rem',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--rt-ink-dim)',
        marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--rt-font-display)',
        fontSize: '1.2rem',
        color,
        textShadow: '2px 2px 0 var(--rt-border-dark)',
      }}>{value}</div>
      {sub && (
        <div style={{
          fontFamily: 'var(--rt-font-body)',
          fontSize: '0.85rem',
          color: 'var(--rt-ink-dim)',
          marginTop: 4,
        }}>{sub}</div>
      )}
    </div>
  );
}

function EmptyChart({ icon: Icon, text }) {
  return (
    <div className="text-center py-4" style={{ color: 'var(--rt-ink-dim)' }}>
      <Icon size={40} style={{ opacity: 0.4, marginBottom: 8 }} />
      <p className="mb-0">{text}</p>
    </div>
  );
}

export default function Charts() {
  const { members, chores, loading } = useContext(AppContext);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    fetchStats()
      .then((data) => { if (!cancelled) { setStats(data); setStatsLoading(false); } })
      .catch(() => { if (!cancelled) { setStats(null); setStatsLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const choresByMember = useMemo(() => {
    if (!stats?.choresByMember) return [];
    return stats.choresByMember.map((item, i) => ({
      name: item.name,
      count: item.count,
      fill: item.color || PALETTE[i % PALETTE.length],
    }));
  }, [stats]);

  const pointsByMember = useMemo(() => {
    if (!stats?.pointsByMember) return [];
    return stats.pointsByMember
      .filter((m) => {
        const member = members.find((mm) => mm.id === m.id);
        return member && member.role === 'child';
      })
      .map((item, i) => ({
        name: item.name,
        value: Math.max(0, item.balance ?? 0),
        color: item.color || PALETTE[i % PALETTE.length],
      }));
  }, [stats, members]);

  const choreStatusData = useMemo(
    () => computeChoreStatusData(members, chores || []),
    [members, chores]
  );

  const totalPoints = useMemo(() => {
    if (!stats?.pointsByMember) return 0;
    return stats.pointsByMember.reduce((sum, m) => sum + Math.max(0, m.balance ?? 0), 0);
  }, [stats]);

  const completionRate = useMemo(() => {
    const active = (chores || []).filter((c) => c.status !== 'failed');
    if (active.length === 0) return 0;
    const done = active.filter((c) => c.status === 'done').length;
    return Math.round((done / active.length) * 100);
  }, [chores]);

  const topStreaker = useMemo(() => getTopStreaker(chores || [], members), [chores, members]);
  const mostFailed = useMemo(() => getMostFailed(chores || [], members), [chores, members]);

  if (loading || statsLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="warning" />
        <p style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.7rem' }} className="rt-blink mt-3">
          LOADING STATS...
        </p>
      </div>
    );
  }

  const noChores = (chores || []).filter((c) => c.status !== 'failed').length === 0;

  return (
    <Row className="g-3">
      <Col xs={12} md={6}>
        <Card className="h-100">
          <Card.Header className="d-flex align-items-center gap-2">
            <FaChartBar /> CHORES BY KID
          </Card.Header>
          <Card.Body>
            {noChores || choresByMember.length === 0 ? (
              <EmptyChart icon={FaChartBar} text="No completed chores yet." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={choresByMember} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontFamily: 'VT323, monospace', fontSize: 14 }} stroke={GRID_COLOR} />
                  <YAxis tick={{ fill: AXIS_COLOR, fontFamily: 'VT323, monospace', fontSize: 14 }} stroke={GRID_COLOR} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,204,0,0.08)' }} />
                  <Bar dataKey="count">
                    {choresByMember.map((entry, idx) => <Cell key={idx} fill={entry.fill} stroke="#0a0918" strokeWidth={2} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card.Body>
        </Card>
      </Col>

      <Col xs={12} md={6}>
        <Card className="h-100">
          <Card.Header className="d-flex align-items-center gap-2">
            <FaChartPie /> POINTS DISTRIBUTION
          </Card.Header>
          <Card.Body>
            {pointsByMember.length === 0 ? (
              <EmptyChart icon={FaChartPie} text="No points earned yet." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pointsByMember}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={95}
                    dataKey="value"
                    paddingAngle={3}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {pointsByMember.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="#0a0918" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} pts`, 'Points']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card.Body>
        </Card>
      </Col>

      <Col xs={12} md={6}>
        <Card className="h-100">
          <Card.Header className="d-flex align-items-center gap-2">
            <FaChartBar /> STATUS BREAKDOWN
          </Card.Header>
          <Card.Body>
            {noChores || choreStatusData.length === 0 ? (
              <EmptyChart icon={FaChartBar} text="No chores assigned yet." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={choreStatusData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontFamily: 'VT323, monospace', fontSize: 14 }} stroke={GRID_COLOR} />
                  <YAxis tick={{ fill: AXIS_COLOR, fontFamily: 'VT323, monospace', fontSize: 14 }} stroke={GRID_COLOR} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,204,0,0.08)' }} />
                  <Legend wrapperStyle={{ color: AXIS_COLOR, fontFamily: 'VT323, monospace', fontSize: 14 }} />
                  <Bar dataKey="todo" name="To Do" stackId="a" fill={STATUS_COLORS.todo} stroke="#0a0918" strokeWidth={1} />
                  <Bar dataKey="in_progress" name="In Progress" stackId="a" fill={STATUS_COLORS.in_progress} stroke="#0a0918" strokeWidth={1} />
                  <Bar dataKey="done" name="Done" stackId="a" fill={STATUS_COLORS.done} stroke="#0a0918" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card.Body>
        </Card>
      </Col>

      <Col xs={12} md={6}>
        <Card className="h-100">
          <Card.Header className="d-flex align-items-center gap-2">
            <FaStar /> HIGH SCORES
          </Card.Header>
          <Card.Body>
            <Row className="g-2 h-100">
              <Col xs={6}>
                <StatTile
                  icon={<FaFire size={22} />}
                  color="var(--rt-accent-2)"
                  label="Hot Streak (7d)"
                  value={topStreaker ? topStreaker.count : '—'}
                  sub={topStreaker ? `${topStreaker.member.avatar || ''} ${topStreaker.member.name}` : 'No one yet'}
                />
              </Col>
              <Col xs={6}>
                <StatTile
                  icon={<FaClock size={22} />}
                  color="var(--rt-danger)"
                  label="Most Failed"
                  value={mostFailed ? mostFailed.count : '—'}
                  sub={mostFailed ? `${mostFailed.member.avatar || ''} ${mostFailed.member.name}` : 'No one yet'}
                />
              </Col>
              <Col xs={6}>
                <StatTile
                  icon={<FaStar size={22} />}
                  color="var(--rt-accent)"
                  label="Family Points"
                  value={totalPoints}
                />
              </Col>
              <Col xs={6}>
                <StatTile
                  icon={<FaTrophy size={22} />}
                  color="var(--rt-success)"
                  label="Completion Rate"
                  value={`${completionRate}%`}
                />
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
