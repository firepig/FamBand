import { useState, useEffect, useContext, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Badge,
  Button,
  Modal,
  Form,
  Spinner,
  Nav,
  Alert,
} from 'react-bootstrap';
import {
  FaShoppingCart,
  FaStar,
  FaPlus,
  FaEdit,
  FaHistory,
  FaCoins,
  FaCheck,
  FaTimes,
  FaLock,
  FaRedoAlt,
} from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import {
  fetchSnacks,
  createSnack,
  updateSnack,
  fetchSnackHistory,
  fetchPoints,
  redeemSnack,
} from '../../api';

const FOOD_EMOJIS = [
  '🍎', '🍕', '🍔', '🍟', '🌮', '🍩', '🍪', '🍦', '🍰', '🧁',
  '🍫', '🍿', '🥤', '🧃', '🍭', '🍬', '🍉', '🍇', '🍓', '🥨',
];

function SnackCard({
  snack,
  points,
  onBuy,
  onEdit,
  onToggleAvailability,
  isParent,
  currentMember,
}) {
  const [showBuyConfirm, setShowBuyConfirm] = useState(false);

  const canAfford = points >= snack.cost;
  const isAvailable = snack.available;

  const handleBuyClick = () => {
    if (!currentMember) return;
    setShowBuyConfirm(true);
  };

  const handleConfirmBuy = () => {
    setShowBuyConfirm(false);
    onBuy(snack);
  };

  return (
    <>
      <Card
        className="shadow-sm h-100 position-relative overflow-hidden"
        style={{
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          border: isAvailable ? '1px solid #dee2e6' : '1px dashed #adb5bd',
        }}
        onMouseEnter={(e) => {
          if (isAvailable) {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = '';
        }}
      >
        {!isAvailable && (
          <div
            className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
            style={{
              zIndex: 2,
              backgroundColor: 'rgba(0,0,0,0.4)',
              borderRadius: 'inherit',
            }}
          >
            <Badge bg="danger" className="fs-6 px-3 py-2">Sold Out</Badge>
          </div>
        )}

        {isParent && (
          <div className="position-absolute top-0 end-0 m-1 d-flex gap-1" style={{ zIndex: 3 }}>
            <Button
              variant="light"
              size="sm"
              className="p-1 rounded-circle shadow-sm"
              style={{ width: 28, height: 28 }}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(snack);
              }}
              title="Edit snack"
            >
              <FaEdit size={12} />
            </Button>
            <Button
              variant={isAvailable ? 'light' : 'success'}
              size="sm"
              className="p-1 rounded-circle shadow-sm"
              style={{ width: 28, height: 28 }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleAvailability(snack);
              }}
              title={isAvailable ? 'Mark unavailable' : 'Mark available'}
            >
              {isAvailable ? <FaTimes size={12} /> : <FaCheck size={12} />}
            </Button>
          </div>
        )}

        <Card.Body className="text-center d-flex flex-column align-items-center p-3">
          <div
            style={{
              fontSize: '4rem',
              lineHeight: 1,
              filter: isAvailable ? 'none' : 'grayscale(0.6)',
              transition: 'filter 0.3s',
            }}
          >
            {snack.image || '🍬'}
          </div>
          <div className="fw-bold mt-2" style={{ fontSize: '0.95rem' }}>
            {snack.name}
          </div>
          <p className="text-muted small mb-2" style={{ fontSize: '0.75rem', flex: 1 }}>
            {snack.description}
          </p>
          <Badge
            bg="warning"
            text="dark"
            pill
            className="d-flex align-items-center gap-1 mb-2"
            style={{ fontSize: '0.8rem' }}
          >
            <FaCoins />
            {snack.cost}
          </Badge>
          {currentMember && (
            <Button
              variant={canAfford && isAvailable ? 'success' : 'secondary'}
              size="sm"
              className="d-flex align-items-center gap-1 w-100"
              disabled={!canAfford || !isAvailable}
              onClick={handleBuyClick}
            >
              <FaShoppingCart size={12} />
              {!isAvailable ? 'Sold Out' : !canAfford ? `Need ${snack.cost - points} more` : 'Buy'}
            </Button>
          )}
        </Card.Body>
      </Card>

      {/* Buy Confirmation Modal */}
      <Modal show={showBuyConfirm} onHide={() => setShowBuyConfirm(false)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold fs-6">Confirm Purchase</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          <div style={{ fontSize: '3rem' }}>{snack.image || '🍬'}</div>
          <p className="fw-bold mt-2 mb-1">Buy {snack.name}?</p>
          <p className="text-muted small mb-0">
            Cost: <FaCoins className="text-warning" /> {snack.cost} points
          </p>
          <p className="text-muted small">
            Your balance: <FaStar className="text-warning" /> {points}
          </p>
          {points < snack.cost ? (
            <div className="alert alert-danger py-2 small mt-2">
              Not enough points! You need {snack.cost - points} more.
            </div>
          ) : (
            <div className="alert alert-success py-2 small mt-2">
              After purchase: <strong>{points - snack.cost}</strong> points remaining
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-center">
          <Button variant="secondary" size="sm" onClick={() => setShowBuyConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="success"
            size="sm"
            className="d-flex align-items-center gap-1"
            disabled={points < snack.cost}
            onClick={handleConfirmBuy}
          >
            <FaShoppingCart size={12} />
            Buy Now
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default function SnackShop() {
  const { members, currentMember } = useContext(AppContext);
  const [snacks, setSnacks] = useState([]);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('shop');
  const [buying, setBuying] = useState(null);
  const [showCoinAnim, setShowCoinAnim] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Snack form state
  const [showSnackModal, setShowSnackModal] = useState(false);
  const [editingSnack, setEditingSnack] = useState(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCost, setFormCost] = useState(5);
  const [formEmoji, setFormEmoji] = useState('🍬');
  const [formAvailable, setFormAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isParent = currentMember?.role === 'parent';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [snacksData, pointsData] = await Promise.all([
        fetchSnacks(),
        currentMember ? fetchPoints(currentMember.id) : Promise.resolve({ balance: 0 }),
      ]);
      setSnacks(snacksData);
      setPoints(pointsData.balance ?? 0);
    } catch {
      setSnacks([]);
      setPoints(0);
    } finally {
      setLoading(false);
    }
  }, [currentMember]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadHistory = useCallback(async () => {
    if (!currentMember) return;
    setHistoryLoading(true);
    try {
      const data = await fetchSnackHistory(currentMember.id);
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [currentMember]);

  useEffect(() => {
    if (activeTab === 'history' && currentMember) {
      loadHistory();
    }
  }, [activeTab, currentMember, loadHistory]);

  const handleBuy = async (snack) => {
    if (!currentMember) return;
    setBuying(snack.id);
    try {
      const result = await redeemSnack(currentMember.id, snack.id);
      setPoints(result.balance ?? points - snack.cost);
      setShowCoinAnim(true);
      setSuccessMsg(`Enjoy your ${snack.name}!`);
      setTimeout(() => {
        setShowCoinAnim(false);
        setSuccessMsg('');
      }, 2500);
      // Refresh snack history
      loadHistory();
    } catch (err) {
      setSuccessMsg('');
      const msg = err.message || 'Purchase failed';
      // Show error briefly
      setSuccessMsg(`Error: ${msg}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setBuying(null);
    }
  };

  const openAddSnack = () => {
    setEditingSnack(null);
    setFormName('');
    setFormDesc('');
    setFormCost(5);
    setFormEmoji('🍬');
    setFormAvailable(true);
    setShowSnackModal(true);
  };

  const openEditSnack = (snack) => {
    setEditingSnack(snack);
    setFormName(snack.name);
    setFormDesc(snack.description || '');
    setFormCost(snack.cost);
    setFormEmoji(snack.image || '🍬');
    setFormAvailable(!!snack.available);
    setShowSnackModal(true);
  };

  const handleSaveSnack = async () => {
    if (!formName.trim() || formCost < 0) return;

    setSubmitting(true);
    try {
      if (editingSnack) {
        const updated = await updateSnack(editingSnack.id, {
          name: formName.trim(),
          description: formDesc.trim(),
          cost: formCost,
          image: formEmoji,
          available: formAvailable,
        });
        setSnacks((prev) => prev.map((s) => (s.id === editingSnack.id ? updated : s)));
      } else {
        const created = await createSnack({
          name: formName.trim(),
          description: formDesc.trim(),
          cost: formCost,
          image: formEmoji,
        });
        setSnacks((prev) => [...prev, created]);
      }
      setShowSnackModal(false);
    } catch (err) {
      // handle silently
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAvailability = async (snack) => {
    try {
      const updated = await updateSnack(snack.id, { available: !snack.available });
      setSnacks((prev) => prev.map((s) => (s.id === snack.id ? updated : s)));
    } catch {
      // handle silently
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="warning" />
        <p className="text-muted mt-2">Loading snack shop...</p>
      </div>
    );
  }

  const availableSnacks = snacks.filter((s) => s.available);

  return (
    <>
      {/* Coin Fly Animation */}
      {showCoinAnim && (
        <div
          className="position-fixed top-50 start-50 translate-middle"
          style={{ zIndex: 9999, pointerEvents: 'none' }}
        >
          <div className="coin-animation text-center">
            <div style={{ fontSize: '4rem', animation: 'coinBounce 0.6s ease-out' }}>
              🪙
            </div>
            <div
              className="fw-bold fs-4 text-success"
              style={{ animation: 'fadeIn 0.3s ease-out' }}
            >
              Purchased!
            </div>
          </div>
        </div>
      )}

      {/* Success/Error Message */}
      {successMsg && !showCoinAnim && (
        <Alert
          variant={successMsg.includes('Error') ? 'danger' : 'success'}
          className="position-fixed top-0 start-50 translate-middle-x mt-4 shadow-lg text-center"
          style={{ zIndex: 9999, minWidth: 280 }}
          dismissible
          onClose={() => setSuccessMsg('')}
        >
          {successMsg}
        </Alert>
      )}

      <Card className="shadow-sm">
        <Card.Header
          className="fw-bold fs-5 d-flex align-items-center justify-content-between"
          style={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: '#fff',
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <FaShoppingCart />
            <span>Snack Shop</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            {currentMember && (
              <Badge bg="light" text="dark" className="d-flex align-items-center gap-1 px-3 py-2" pill>
                <FaStar className="text-warning" />
                <span className="fw-bold">{points}</span>
                <span className="small text-muted">pts</span>
              </Badge>
            )}
            {isParent && (
              <Button
                variant="light"
                size="sm"
                className="d-flex align-items-center gap-1"
                onClick={openAddSnack}
              >
                <FaPlus size={12} />
                Add Snack
              </Button>
            )}
          </div>
        </Card.Header>

        <Card.Body>
          {!currentMember && (
            <Alert variant="info" className="text-center small mb-3">
              Sign in to purchase snacks with your points!
            </Alert>
          )}

          {/* Tabs */}
          <Nav
            variant="pills"
            className="mb-3 justify-content-center"
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k || 'shop')}
          >
            <Nav.Item>
              <Nav.Link eventKey="shop" className="d-flex align-items-center gap-1">
                <FaShoppingCart size={12} /> Shop
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="history" className="d-flex align-items-center gap-1">
                <FaHistory size={12} /> History
              </Nav.Link>
            </Nav.Item>
          </Nav>

          {/* Shop Tab */}
          {activeTab === 'shop' && (
            <>
              {snacks.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <FaShoppingCart size={48} className="mb-3 opacity-50" />
                  <p className="fw-semibold mb-1">Shop is empty!</p>
                  <p className="small mb-0">Ask a parent to stock up <FaShoppingCart size={12} /></p>
                </div>
              ) : points === 0 && currentMember && snacks.length > 0 ? (
                <>
                  <div className="text-center py-3 text-muted">
                    <FaCoins size={40} className="mb-2 opacity-50" />
                    <p className="mb-0">No points yet! Complete chores to earn rewards! 🎯</p>
                  </div>
                  <Row className="g-3 mt-2">
                    {snacks.map((snack) => (
                      <Col xs={6} sm={6} md={4} lg={3} key={snack.id}>
                        <SnackCard
                          snack={snack}
                          points={points}
                          onBuy={handleBuy}
                          onEdit={openEditSnack}
                          onToggleAvailability={handleToggleAvailability}
                          isParent={isParent}
                          currentMember={currentMember}
                        />
                      </Col>
                    ))}
                  </Row>
                </>
              ) : (
                <Row className="g-3">
                  {snacks.map((snack) => (
                    <Col xs={6} sm={6} md={4} lg={3} key={snack.id}>
                      {buying === snack.id ? (
                        <Card className="shadow-sm h-100 d-flex align-items-center justify-content-center">
                          <Card.Body className="text-center">
                            <Spinner animation="border" variant="success" />
                            <p className="small text-muted mt-2">Buying...</p>
                          </Card.Body>
                        </Card>
                      ) : (
                        <SnackCard
                          snack={snack}
                          points={points}
                          onBuy={handleBuy}
                          onEdit={openEditSnack}
                          onToggleAvailability={handleToggleAvailability}
                          isParent={isParent}
                          currentMember={currentMember}
                        />
                      )}
                    </Col>
                  ))}
                </Row>
              )}
            </>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <>
              {!currentMember ? (
                <div className="text-center py-4 text-muted">
                  <FaHistory size={40} className="mb-2 opacity-50" />
                  <p className="mb-0">Sign in to view your purchase history.</p>
                </div>
              ) : historyLoading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" variant="warning" />
                  <p className="text-muted small mt-1">Loading history...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <FaHistory size={48} className="mb-3 opacity-50" />
                  <p className="fw-semibold mb-1">No purchases yet!</p>
                  <p className="small mb-0">Head to the shop and treat yourself! 🎉</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="d-flex align-items-center gap-3 p-3 rounded-3"
                      style={{
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #eee',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f0f0'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f8f9fa'; }}
                    >
                      <span style={{ fontSize: '2rem' }}>
                        {entry.snack_image || '🍬'}
                      </span>
                      <div className="flex-grow-1">
                        <div className="fw-semibold">{entry.snack_name}</div>
                        <small className="text-muted d-flex align-items-center gap-1">
                          <FaCoins size={10} className="text-warning" />
                          {entry.snack_cost} points
                        </small>
                      </div>
                      <small className="text-muted flex-shrink-0">
                        {entry.redeemed_at
                          ? new Date(entry.redeemed_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Unknown date'}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>

      {/* Add/Edit Snack Modal */}
      <Modal show={showSnackModal} onHide={() => !submitting && setShowSnackModal(false)} centered>
        <Modal.Header closeButton={!submitting}>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            {editingSnack ? <FaEdit /> : <FaPlus />}
            {editingSnack ? 'Edit Snack' : 'Add Snack'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Emoji</Form.Label>
              <div className="d-flex flex-wrap gap-1 mb-2">
                {FOOD_EMOJIS.map((emoji) => (
                  <Button
                    key={emoji}
                    variant={formEmoji === emoji ? 'warning' : 'light'}
                    size="sm"
                    className="p-1"
                    style={{ width: 38, height: 38, fontSize: '1.2rem' }}
                    onClick={() => setFormEmoji(emoji)}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted small">Selected:</span>
                <span style={{ fontSize: '2rem' }}>{formEmoji}</span>
              </div>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Name</Form.Label>
              <Form.Control
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Ice Cream Sundae"
                disabled={submitting}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="What makes this snack special?"
                disabled={submitting}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Cost (points)</Form.Label>
              <Form.Control
                type="number"
                min={0}
                value={formCost}
                onChange={(e) => setFormCost(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={submitting}
              />
            </Form.Group>

            {editingSnack && (
              <Form.Group className="mb-3">
                <Form.Check
                  type="switch"
                  id="snack-available"
                  label="Available for purchase"
                  checked={formAvailable}
                  onChange={(e) => setFormAvailable(e.target.checked)}
                  disabled={submitting}
                />
              </Form.Group>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSnackModal(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveSnack}
            disabled={!formName.trim() || formCost < 0 || submitting}
            className="d-flex align-items-center gap-2"
          >
            {submitting ? (
              <>
                <Spinner animation="border" size="sm" />
                Saving...
              </>
            ) : (
              <>
                {editingSnack ? <FaEdit size={14} /> : <FaPlus size={14} />}
                {editingSnack ? 'Save Changes' : 'Add Snack'}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Coin animation keyframes injected once */}
      <style>{`
        @keyframes coinBounce {
          0% { transform: scale(0.3) translateY(50px); opacity: 0; }
          50% { transform: scale(1.2) translateY(-10px); opacity: 1; }
          70% { transform: scale(0.9) translateY(5px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </>
  );
}
