import { Router } from 'express';
import User, { MOODS } from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { getIO, conversationRoom } from '../socket/io.js';
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
    .select('name email profileImage isOnline lastSeen mood')
    .sort({ name: 1 })
    .limit(20);

  res.json({ users });
});

// PATCH /api/users/me — update your own name, profile picture and/or mood.
// Multipart form: name, profileImage (file), removeImage ("true"), mood.
// (A JSON body works too for name and mood.)
router.patch('/me', imageUpload.single('profileImage'), async (req, res) => {
  const updates = {};

  const body = req.body || {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 50) return res.status(400).json({ error: 'Name must be 2–50 characters.' });
    updates.name = name;
  }

  if (body.mood !== undefined) {
    const mood = String(body.mood);
    if (!MOODS.includes(mood)) return res.status(400).json({ error: 'Unknown mood.' });
    updates.mood = mood;
  }

  if (req.file) {
    updates.profileImage = await saveImage(req.file.buffer, { maxSize: 400 });
  } else if (body.removeImage === 'true') {
    updates.profileImage = '';
  }

  const user = await User.findByIdAndUpdate(req.userId, updates, { returnDocument: 'after' });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Everyone I chat with sees the new mood next to my name
  if (updates.mood !== undefined) {
    const conversations = await Conversation.find({ participants: req.userId }).select('_id');
    const rooms = conversations.map((c) => conversationRoom(c._id));
    if (rooms.length) getIO()?.to(rooms).emit('user:mood', { userId: req.userId, mood: user.mood });
  }

  res.json({ user });
});

export default router;
