import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimits.js';
import { setAuthCookie, clearAuthCookie } from '../utils/jwt.js';
import { saveImage } from '../utils/storage.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register — multipart form (it can include a profile picture)
router.post('/register', registerLimiter, imageUpload.single('profileImage'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (name.length < 2 || name.length > 50) return res.status(400).json({ error: 'Name must be 2–50 characters.' });
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });

  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const profileImage = req.file ? await saveImage(req.file.buffer, { maxSize: 400 }) : '';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await User.create({ name, email, password: hashedPassword, profileImage });
    setAuthCookie(res, user._id);
    res.status(201).json({ user });
  } catch (err) {
    // Two sign-ups with the same email at the same moment
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
    throw err;
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) return res.status(400).json({ error: 'Please enter your email and password.' });

  const user = await User.findOne({ email }).select('+password');
  if (!user) return res.status(404).json({ error: 'No account found with this email.' });

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

  setAuthCookie(res, user._id);
  res.json({ user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// GET /api/auth/me — the logged-in user (used to restore the session after a refresh)
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

export default router;
