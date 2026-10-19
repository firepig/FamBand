import { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Navbar as BsNavbar, Nav, NavDropdown, Badge, Container, Spinner } from 'react-bootstrap';
import { FaStar, FaUser, FaCrown, FaGamepad } from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchPoints } from '../../api';
import Avatar from '../common/Avatar';

export default function Navbar() {
  const { members, currentMember, switchMember, logout, isParent, chores, stats, snacks } = useContext(AppContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [points, setPoints] = useState(null);
  const [pointsTick, setPointsTick] = useState(0);
  const [pointsLoading, setPointsLoading] = useState(false);

  useEffect(() => {
    if (!currentMember) return;
    let cancelled = false;
    fetchPoints(currentMember.id)
      .then((data) => {
        if (cancelled) return;
        setPoints(typeof data.balance === 'number' ? data.balance : 0);
        setPointsLoading(false);
      })
      .catch(() => { if (!cancelled) { setPoints(0); setPointsLoading(false); } });
    return () => { cancelled = true; };
  }, [currentMember?.id, chores, stats, snacks, pointsTick]);

  // Pages that spend points (shop, cash out) announce it so the badge updates right away.
  useEffect(() => {
    const bump = () => setPointsTick((n) => n + 1);
    window.addEventListener('points-changed', bump);
    return () => window.removeEventListener('points-changed', bump);
  }, []);

  const navLinks = [
    { label: 'BOARD', path: '/' },
    { label: 'BULLETIN', path: '/bulletin' },
    { label: 'HOMEWORK', path: '/homework' },
    { label: 'SHOP', path: '/snacks' },
    { label: 'STATS', path: '/stats' },
    ...(isParent ? [{ label: 'FAMILY', path: '/family' }] : []),
  ];

  return (
    <BsNavbar expand="lg" sticky="top">
      <Container fluid>
        <BsNavbar.Brand as={Link} to="/">
          ★ FAMBAND
        </BsNavbar.Brand>

        <BsNavbar.Toggle aria-controls="main-navbar-nav" />

        <BsNavbar.Collapse id="main-navbar-nav">
          <Nav className="me-auto">
            {navLinks.map((link) => (
              <Nav.Link
                key={link.path}
                as={Link}
                to={link.path}
                active={location.pathname === link.path}
              >
                {link.label}
              </Nav.Link>
            ))}
          </Nav>

          <Nav className="align-items-center gap-2">
            {currentMember && (
              <span className="rt-view-badge" style={{
                borderColor: isParent ? 'var(--rt-accent)' : 'var(--rt-primary)',
                color: isParent ? 'var(--rt-accent)' : 'var(--rt-primary)',
              }}>
                {isParent ? <FaCrown /> : <FaGamepad />}
                {isParent ? 'PARENT' : 'PLAYER'}
              </span>
            )}

            {currentMember && (
              <div className="d-flex align-items-center" style={{
                fontFamily: 'var(--rt-font-display)',
                fontSize: '0.7rem',
                color: 'var(--rt-accent)',
                padding: '4px 8px',
                border: '2px solid var(--rt-accent)',
              }}>
                {pointsLoading ? (
                  <Spinner animation="border" size="sm" />
                ) : (
                  <>
                    <FaStar style={{ marginRight: 6 }} />
                    {points ?? 0}
                  </>
                )}
              </div>
            )}

            <NavDropdown
              title={
                <span className="d-inline-flex align-items-center" style={{ color: 'var(--rt-ink)' }}>
                  {currentMember ? (
                    <>
                      <span className="me-1"><Avatar avatar={currentMember.avatar} /></span>
                      <span className="d-none d-lg-inline">{currentMember.name}</span>
                    </>
                  ) : <FaUser />}
                </span>
              }
              id="member-dropdown"
              align="end"
            >
              {currentMember && (
                <>
                  <NavDropdown.Item disabled>
                    Signed in as <strong>{currentMember.name}</strong>
                  </NavDropdown.Item>
                  <NavDropdown.Divider />
                </>
              )}
              <NavDropdown.Item as={Link} to="/profile">
                Edit profile
              </NavDropdown.Item>
              <NavDropdown.Item onClick={() => switchMember()}>
                Switch player
              </NavDropdown.Item>
              <NavDropdown.Item onClick={async () => { await switchMember(); navigate('/billboard'); }}>
                Billboard view
              </NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item onClick={() => logout()}>
                Sign out
              </NavDropdown.Item>
            </NavDropdown>
          </Nav>
        </BsNavbar.Collapse>
      </Container>
    </BsNavbar>
  );
}
