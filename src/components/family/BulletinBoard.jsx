import { useState, useEffect, useContext, useCallback } from 'react';
import {
  Card,
  Button,
  Modal,
  Form,
  Spinner,
  Row,
  Col,
} from 'react-bootstrap';
import {
  FaThumbtack,
  FaTrash,
  FaPaperPlane,
  FaCommentAlt,
} from 'react-icons/fa';
import AppContext from '../../context/AppContext';
import { fetchBulletinPosts, createBulletinPost, deleteBulletinPost } from '../../api';
import Avatar from '../common/Avatar';

const STICKY_COLORS = ['#fff9c4', '#ffecb3', '#c8e6c9', '#bbdefb', '#f8bbd0'];

function getRandomRotation() {
  return (Math.random() * 4 - 1).toFixed(1); // -1 to 3 degrees
}

function getRandomColor() {
  return STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
}

function getRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BulletinBoard() {
  const { members, currentMember } = useContext(AppContext);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hoveredPost, setHoveredPost] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBulletinPosts();
      setPosts(data);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleSubmit = async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    if (!currentMember) {
      setError('You must be signed in to post.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await createBulletinPost({ authorId: currentMember.id, content: trimmed });
      setNewContent('');
      setShowModal(false);
      await loadPosts();
    } catch (err) {
      setError(err.message || 'Failed to post. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (postId) => {
    setDeleting(postId);
    try {
      await deleteBulletinPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      // silently fail
    } finally {
      setDeleting(null);
    }
  };

  const canDelete = (post) => {
    if (!currentMember) return false;
    if (currentMember.role === 'parent') return true;
    return post.author_id === currentMember.id || post.authorId === currentMember.id;
  };

  const charCount = newContent.length;
  const maxChars = 280;
  const isOverLimit = charCount > maxChars;

  return (
    <>
      <Card className="shadow-sm">
        <Card.Header
          className="fw-bold fs-5 d-flex align-items-center justify-content-between"
          style={{
            background: 'linear-gradient(135deg, #8e44ad 0%, #3498db 100%)',
            color: '#fff',
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <FaThumbtack />
            <span>Bulletin Board</span>
          </div>
          <Button
            variant="light"
            size="sm"
            className="d-flex align-items-center gap-1"
            onClick={() => {
              if (!currentMember) {
                setError('Please sign in to post.');
                return;
              }
              setError('');
              setShowModal(true);
            }}
          >
            <FaThumbtack size={12} />
            Pin a Note
          </Button>
        </Card.Header>

        <Card.Body
          className="cork-board"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(139, 90, 43, 0.05) 40px, rgba(139, 90, 43, 0.05) 41px),
              repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(139, 90, 43, 0.05) 40px, rgba(139, 90, 43, 0.05) 41px)
            `,
            backgroundColor: '#f5e6c8',
            minHeight: 300,
            borderRadius: '0 0 6px 6px',
            position: 'relative',
          }}
        >
          {loading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 200 }}>
              <Spinner animation="border" variant="secondary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="d-flex flex-column align-items-center justify-content-center text-muted" style={{ minHeight: 200 }}>
              <FaCommentAlt size={40} className="mb-3 opacity-50" />
              <p className="mb-1 fw-semibold">No notes yet!</p>
              <p className="mb-0 small">Pin the first one <FaThumbtack size={12} /></p>
            </div>
          ) : (
            <Row className="g-3 justify-content-center">
              {posts.map((post) => {
                const rotation = getRandomRotation();
                const bgColor = getRandomColor();

                // Normalize field names (db style or context style)
                const authorId = post.author_id || post.authorId;
                const authorName = post.author_name || post.authorName || 'Unknown';
                const authorAvatar = post.author_avatar || post.authorAvatar || '👤';
                const authorColor = post.author_color || post.color || '#6c757d';
                const postId = post.id;
                const postContent = post.content;
                const createdAt = post.created_at || post.createdAt;

                return (
                  <Col xs={12} sm={6} md={4} lg={3} key={postId}>
                    <div
                      className="sticky-note position-relative"
                      style={{
                        transform: `rotate(${rotation}deg)`,
                        backgroundColor: bgColor,
                        padding: '16px',
                        borderRadius: '4px',
                        minHeight: 140,
                        boxShadow: '2px 3px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        cursor: 'default',
                        animation: 'fadeIn 0.4s ease-out',
                        position: 'relative',
                        wordBreak: 'break-word',
                      }}
                      onMouseEnter={(e) => {
                        setHoveredPost(postId);
                        e.currentTarget.style.transform = `rotate(${rotation}deg) scale(1.03)`;
                        e.currentTarget.style.boxShadow = '4px 6px 16px rgba(0,0,0,0.2)';
                      }}
                      onMouseLeave={(e) => {
                        setHoveredPost(null);
                        e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                        e.currentTarget.style.boxShadow = '2px 3px 8px rgba(0,0,0,0.15)';
                      }}
                    >
                      {/* Pin icon top center */}
                      <div
                        className="position-absolute top-0 start-50 translate-middle"
                        style={{ fontSize: '1.2rem', lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                      >
                        📌
                      </div>

                      {/* Delete button */}
                      {hoveredPost === postId && canDelete(post) && (
                        <Button
                          variant="link"
                          size="sm"
                          className="position-absolute top-0 end-0 p-1 text-danger"
                          style={{ zIndex: 2 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(postId);
                          }}
                          disabled={deleting === postId}
                          title="Delete post"
                        >
                          {deleting === postId ? (
                            <Spinner animation="border" size="sm" />
                          ) : (
                            <FaTrash size={12} />
                          )}
                        </Button>
                      )}

                      {/* Author */}
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <span style={{ fontSize: '1.5rem' }}><Avatar avatar={authorAvatar} /></span>
                        <div>
                          <div className="fw-bold small" style={{ color: authorColor }}>
                            {authorName}
                          </div>
                          <small className="text-muted" style={{ fontSize: '0.6rem' }}>
                            {getRelativeTime(createdAt)}
                          </small>
                        </div>
                      </div>

                      {/* Content */}
                      <p className="mb-0" style={{ fontSize: '0.9rem', lineHeight: 1.4, color: '#333' }}>
                        {postContent}
                      </p>
                    </div>
                  </Col>
                );
              })}
            </Row>
          )}
        </Card.Body>
      </Card>

      {/* New Post Modal */}
      <Modal show={showModal} onHide={() => !submitting && setShowModal(false)} centered>
        <Modal.Header closeButton={!submitting}>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <FaThumbtack />
            Pin a Note
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && (
            <div className="alert alert-danger py-2 small">{error}</div>
          )}
          <Form>
            <Form.Group>
              <Form.Label className="fw-semibold">Your Note</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What's on your mind?"
                maxLength={maxChars + 20}
                isInvalid={isOverLimit}
                disabled={submitting}
                autoFocus
              />
              <div className="d-flex justify-content-between mt-1">
                <small className={isOverLimit ? 'text-danger' : 'text-muted'}>
                  {charCount}/{maxChars}
                </small>
              </div>
            </Form.Group>

            {currentMember && (
              <div className="d-flex align-items-center gap-2 mt-2">
                <span style={{ fontSize: '1.2rem' }}><Avatar avatar={currentMember.avatar} /></span>
                <small className="text-muted">
                  Posting as <strong>{currentMember.name}</strong>
                </small>
              </div>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!newContent.trim() || isOverLimit || submitting}
            className="d-flex align-items-center gap-2"
          >
            {submitting ? (
              <>
                <Spinner animation="border" size="sm" />
                Posting...
              </>
            ) : (
              <>
                <FaPaperPlane size={14} />
                Post
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
