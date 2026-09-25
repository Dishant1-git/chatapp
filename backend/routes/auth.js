import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { loginLimiter, registerLimiter, verifyLimiter } from '../middleware/rateLimits.js';
import { setAuthCookie, clearAuthCookie } from '../utils/jwt.js';
import { saveImage } from '../utils/storage.js';
import EmailCode, { CODE_TTL_MINUTES, MAX_ATTEMPTS, codeMatches, hashCode, makeCode } from '../models/EmailCode.js';
import { sendMail, verificationMail } from '../utils/mailer.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Development and automated tests: accounts are confirmed the moment they're
// made, so there's no inbox to check. Never set this on a real server.
const autoVerify = () => process.env.AUTO_VERIFY_EMAIL === '1';

// ✉️ Makes a fresh code for this account, stores only its hash and emails it.
// Any earlier code stops working, so the newest email is always the right one.
async function sendVerificationCode(user) {
  const code = makeCode();
  await EmailCode.findOneAndUpdate(
    { userId: user._id },
    {
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
      attempts: 0,
    },
    { upsert: true }
  );

  const mail = verificationMail(code, user.name);
  await sendMail({ to: user.email, ...mail });
}

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
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      profileImage,
      emailVerified: autoVerify(),
    });
    setAuthCookie(res, user._id);
    // The account exists, but it can't be used until the code is entered.
    // If the email can't go out the account is still made — they can ask for
    // another code from the verification screen.
    if (!user.emailVerified) {
      try {
        await sendVerificationCode(user);
      } catch (err) {
        console.error('[auth] could not send the verification code:', err.message);
      }
    }
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

// POST /api/auth/verify — the six-digit code from the email
router.post('/verify', requireAuth, async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit code from your email.' });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.emailVerified) return res.json({ user });

  const pending = await EmailCode.findOne({ userId: user._id });
  if (!pending || pending.expiresAt <= new Date()) {
    return res.status(400).json({ error: 'That code has expired. Ask for a new one.', code: 'CODE_EXPIRED' });
  }

  if (!codeMatches(code, pending.codeHash)) {
    pending.attempts += 1;
    // Guessing the code shouldn't be possible: after a few tries it's thrown away
    if (pending.attempts >= MAX_ATTEMPTS) {
      await pending.deleteOne();
      return res.status(400).json({ error: 'Too many wrong codes. Ask for a new one.', code: 'CODE_EXPIRED' });
    }
    await pending.save();
    const left = MAX_ATTEMPTS - pending.attempts;
    return res.status(400).json({ error: `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` });
  }

  user.emailVerified = true;
  await user.save();
  await pending.deleteOne();
  res.json({ user });
});

// POST /api/auth/verify/resend — "send me another code"
router.post('/verify/resend', requireAuth, verifyLimiter, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.emailVerified) return res.json({ alreadyVerified: true });

  await sendVerificationCode(user);
  res.json({ sent: true, email: user.email });
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
