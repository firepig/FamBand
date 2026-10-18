import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireActiveMember } from '../middleware/auth.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const posts = db.prepare(
      `SELECT bp.*, fm.name as author_name, fm.avatar as author_avatar, fm.color as author_color
       FROM bulletin_posts bp
       JOIN family_members fm ON bp.author_id = fm.id
       WHERE bp.family_id = ?
       ORDER BY bp.created_at DESC`
    ).all(req.familyId);
    res.json(posts);
  } catch (err) {
    console.error('Error fetching bulletin posts:', err);
    res.status(500).json({ error: 'Failed to fetch bulletin posts' });
  }
});

// Any family member may post; author derived from active member.
router.post('/', requireActiveMember, (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    const db = getDb();
    const id = uuidv4();
    db.prepare('INSERT INTO bulletin_posts (id, family_id, author_id, content) VALUES (?, ?, ?, ?)')
      .run(id, req.familyId, req.currentMember.id, content);
    const post = db.prepare(
      `SELECT bp.*, fm.name as author_name, fm.avatar as author_avatar, fm.color as author_color
       FROM bulletin_posts bp
       JOIN family_members fm ON bp.author_id = fm.id
       WHERE bp.id = ?`
    ).get(id);
    res.status(201).json(post);
  } catch (err) {
    console.error('Error creating bulletin post:', err);
    res.status(500).json({ error: 'Failed to create bulletin post' });
  }
});

// Delete: author or parent.
router.delete('/:id', requireActiveMember, (req, res) => {
  try {
    const db = getDb();
    const post = db.prepare('SELECT * FROM bulletin_posts WHERE id = ? AND family_id = ?')
      .get(req.params.id, req.familyId);
    if (!post) return res.status(404).json({ error: 'Bulletin post not found' });
    const isAuthor = post.author_id === req.currentMember.id;
    const isParent = req.currentMember.role === 'parent';
    if (!isAuthor && !isParent) return res.status(403).json({ error: 'Not allowed' });
    db.prepare('DELETE FROM bulletin_posts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Bulletin post deleted' });
  } catch (err) {
    console.error('Error deleting bulletin post:', err);
    res.status(500).json({ error: 'Failed to delete bulletin post' });
  }
});

export default router;
