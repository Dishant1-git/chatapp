import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { saveImage } from '../utils/storage.js';

const router = Router();
router.use(requireAuth);

// Escape characters that have a special meaning in regular expressions
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/users/search?q=john — search other users by name or email
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  if (!q) return res.json({ users: [] });

  const pattern = new RegExp(escapeRegex(q), 'i');
  const users = await User.find({
    _id: { $ne: req.userId },
    $or: [{ name: pattern }, { email: pattern }],
  })
    .select('name email profileImage isOnline lastSeen')
    .sort({ name: 1 })
    .limit(20);

  res.json({ users });
});

// PATCH /api/users/me — update your own name and/or profile picture.
// Multipart form: name, profileImage (file), removeImage ("true")
router.patch('/me', imageUpload.single('profileImage'), async (req, res) => {
  const updates = {};

  const body = req.body || {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 50) return res.status(400).json({ error: 'Name must be 2–50 characters.' });
    updates.name = name;
  }

  if (req.file) {
    updates.profileImage = await saveImage(req.file.buffer, { maxSize: 400 });
  } else if (body.removeImage === 'true') {
    updates.profileImage = '';
  }

  const user = await User.findByIdAndUpdate(req.userId, updates, { returnDocument: 'after' });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  res.json({ user });
});

export default router;
