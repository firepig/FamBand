import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

const router = Router();

// GET / — list all posts with author info
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const posts = db.prepare(
      `SELECT bp.*, fm.name as author_name, fm.avatar as author_avatar, fm.color as author_color
       FROM bulletin_posts bp
       JOIN family_members fm ON bp.author_id = fm.id
       ORDER BY bp.created_at DESC`
    ).all();

    res.json(posts);
  } catch (err) {
    console.error('Error fetching bulletin posts:', err);
    res.status(500).json({ error: 'Failed to fetch bulletin posts' });
  }
});

// POST / — create a post
router.post('/', (req, res) => {
  try {
    const { authorId, content } = req.body;
    const db = getDb();

    if (!authorId || !content) {
      return res.status(400).json({ error: 'authorId and content are required' });
    }

    const id = uuidv4();
    db.prepare(
      'INSERT INTO bulletin_posts (id, author_id, content) VALUES (?, ?, ?)'
    ).run(id, authorId, content);

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

// DELETE /:id — delete a post
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const post = db.prepare('SELECT * FROM bulletin_posts WHERE id = ?').get(req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Bulletin post not found' });
    }

    db.prepare('DELETE FROM bulletin_posts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Bulletin post deleted successfully' });
  } catch (err) {
    console.error('Error deleting bulletin post:', err);
    res.status(500).json({ error: 'Failed to delete bulletin post' });
  }
});

export default router;
