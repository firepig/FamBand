import { Router } from 'express';
import { requireActiveMember, requireParent } from '../middleware/auth.js';
import { imageUpload } from '../lib/uploads.js';

const router = Router();

// POST /quest — upload a quest image (parent only). Returns the stored filename,
// which the client then sends as `image` when creating/updating a quest or template.
router.post('/quest', requireActiveMember, requireParent, imageUpload('quest'), (req, res) => {
  res.status(201).json({ image: req.upload.filename });
});

export default router;
