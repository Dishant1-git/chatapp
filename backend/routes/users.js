import { Router } from 'express';
import { cached } from '../utils/cache.js';
import { isValidObjectId } from 'mongoose';
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

// GET /api/users/search?q=john — search other users by name, by @username, or
// by their exact email. Emails are private: they're never returned, and a partial
// email doesn't match (so nobody can guess addresses letter by letter). Usernames
// are public handles, so those do match part way.
// Nothing here says whether someone is online or when they were last seen: that's
// for people you actually chat with, not for anyone who can type your name.
const SEARCH_RESULTS = 20;
const SEARCH_CACHE_SECONDS = 60;

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.json({ users: [] });

  const pattern = new RegExp(escapeRegex(q.slice(0, 50)), 'i');
  // "@dishant" and "dishant" should both find the same person
  const handle = new RegExp(escapeRegex(q.replace(/^@/, '').slice(0, 50)), 'i');
  const find = (limit) =>
    User.find({ $or: [{ name: pattern }, { username: handle }, { email: q.toLowerCase() }] })
      .select('name username profileImage')
      .sort({ name: 1 })
      .limit(limit)
      .lean();

  // The same letters find the same people whoever types them, so a search is
  // kept for a minute (utils/cache.js) and the searcher is taken out afterwards.
  // Not when it has an "@" in it: that may be someone's email address, and
  // those aren't written anywhere they don't have to be.
  const found = q.includes('@')
    ? await find(SEARCH_RESULTS + 1)
    : await cached(`people:${q.toLowerCase()}`, SEARCH_CACHE_SECONDS, () => find(SEARCH_RESULTS + 1));

  res.json({ users: found.filter((user) => String(user._id) !== req.userId).slice(0, SEARCH_RESULTS) });
});

const MAX_TRUSTED = 50;

// PUT /api/users/me/trusted/:userId — add someone to my ⭐ Trusted Ghosts
router.put('/me/trusted/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId) || userId === req.userId) return res.status(400).json({ error: 'Invalid user.' });
  if (!(await User.exists({ _id: userId }))) return res.status(404).json({ error: 'User not found.' });

  const user = await User.findOneAndUpdate(
    { _id: req.userId, [`trusted.${MAX_TRUSTED - 1}`]: { $exists: false } },
    { $addToSet: { trusted: userId } },
    { returnDocument: 'after' }
  );
  if (!user) return res.status(400).json({ error: `You can have up to ${MAX_TRUSTED} Trusted Ghosts.` });
  res.json({ trusted: user.trusted.map(String) });
});

// DELETE /api/users/me/trusted/:userId
router.delete('/me/trusted/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user.' });
  const user = await User.findByIdAndUpdate(req.userId, { $pull: { trusted: userId } }, { returnDocument: 'after' });
  res.json({ trusted: (user?.trusted || []).map(String) });
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

  // Everyone I chat with sees my new name, picture and mood straight away, without refreshing
  if (Object.keys(updates).length) {
    const changes = {};
    for (const field of Object.keys(updates)) changes[field] = user[field];
    const conversations = await Conversation.find({ participants: req.userId }).select('_id');
    const rooms = conversations.map((c) => conversationRoom(c._id));
    if (rooms.length) getIO()?.to(rooms).emit('user:updated', { userId: req.userId, changes });
  }

  res.json({ user });
});

export default router;
