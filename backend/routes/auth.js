import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth, rememberVerified } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { loginLimiter, registerLimiter, verifyLimiter, usernameLimiter } from '../middleware/rateLimits.js';
import { setAuthCookie, clearAuthCookie } from '../utils/jwt.js';
import { saveImage } from '../utils/storage.js';
import EmailCode, { CODE_TTL_MINUTES, MAX_ATTEMPTS, codeMatches, hashCode, makeCode } from '../models/EmailCode.js';
import { sendMail, verificationMail, resetMail } from '../utils/mailer.js';
import { passwordProblem } from '../utils/password.js';
import {
  freeUsernameFrom,
  normalizeUsername,
  suggestUsernames,
  usernameProblem,
  usernameTaken,
} from '../utils/username.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Development and automated tests: accounts are confirmed the moment they're
// made, so there's no inbox to check. Never set this on a real server.
const autoVerify = () => process.env.AUTO_VERIFY_EMAIL === '1';

// ✉️ Makes a fresh code for this account, stores only its hash and emails it.
// Any earlier code stops working, so the newest email is always the right one.
async function sendVerificationCode(user, purpose = 'verify') {
  const code = makeCode();
  await EmailCode.findOneAndUpdate(
    { userId: user._id, purpose },
    {
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
      attempts: 0,
    },
    { upsert: true }
  );

  const mail = purpose === 'reset' ? resetMail(code, user.name) : verificationMail(code, user.name);
  await sendMail({ to: user.email, ...mail });
}

// Checks a code someone typed. Returns '' when it's right, or what to tell them.
async function checkCode(user, code, purpose) {
  const pending = await EmailCode.findOne({ userId: user._id, purpose });
  if (!pending || pending.expiresAt <= new Date()) {
    return { error: 'That code has expired. Ask for a new one.', code: 'CODE_EXPIRED' };
  }

  if (!codeMatches(code, pending.codeHash)) {
    pending.attempts += 1;
    // Guessing the code shouldn't be possible: after a few tries it's thrown away
    if (pending.attempts >= MAX_ATTEMPTS) {
      await pending.deleteOne();
      return { error: 'Too many wrong codes. Ask for a new one.', code: 'CODE_EXPIRED' };
    }
    await pending.save();
    const left = MAX_ATTEMPTS - pending.attempts;
    return { error: `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` };
  }

  await pending.deleteOne();
  return null;
}

// POST /api/auth/register — multipart form (it can include a profile picture)
router.post('/register', registerLimiter, imageUpload.single('profileImage'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (name.length < 2 || name.length > 50) return res.status(400).json({ error: 'Name must be 2–50 characters.' });
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  // 🏷️ A username is optional in the request: one is made from their name
  // if the form didn't send it (older clients).
  const username = normalizeUsername(req.body?.username) || (await freeUsernameFrom(name));
  const badUsername = usernameProblem(username);
  if (badUsername) return res.status(400).json({ error: badUsername, code: 'USERNAME_INVALID' });

  const passwordIssue = passwordProblem(password, { name, email, username });
  if (passwordIssue) return res.status(400).json({ error: passwordIssue });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
  }
  if (await usernameTaken(username)) {
    // Hand back a few free ones so the form can offer them
    return res.status(409).json({
      error: `@${username} is taken.`,
      code: 'USERNAME_TAKEN',
      suggestions: await suggestUsernames(username),
    });
  }

  const profileImage = req.file ? await saveImage(req.file.buffer, { maxSize: 400 }) : '';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await User.create({
      name,
      email,
      username,
      password: hashedPassword,
      profileImage,
      emailVerified: autoVerify(),
    });
    setAuthCookie(res, user._id);
    if (user.emailVerified) rememberVerified(user._id);
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

  const problem = await checkCode(user, code, 'verify');
  if (problem) return res.status(400).json(problem);

  user.emailVerified = true;
  await user.save();
  rememberVerified(user._id);
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

// GET /api/auth/username?u=dishant — is this handle free? Used by the sign-up
// form as you type. Answers with a few free ones when it isn't.
router.get('/username', usernameLimiter, async (req, res) => {
  const username = normalizeUsername(req.query.u);
  const problem = usernameProblem(username);
  if (problem) return res.json({ username, available: false, problem, suggestions: [] });

  const taken = await usernameTaken(username);
  res.json({
    username,
    available: !taken,
    problem: '',
    suggestions: taken ? await suggestUsernames(username) : [],
  });
});

// POST /api/auth/password/forgot { email } — emails a reset code.
// Always answers the same way, so nobody can use it to find out who has an account.
router.post('/password/forgot', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  const user = await User.findOne({ email });
  if (user) {
    try {
      await sendVerificationCode(user, 'reset');
    } catch (err) {
      console.error('[auth] could not send the reset code:', err.message);
    }
  }

  res.json({ sent: true });
});

// POST /api/auth/password/reset { email, code, password }
// The code proves they can read that inbox, so it also confirms the address.
router.post('/password/reset', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const password = String(req.body?.password || '');

  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit code from your email.' });

  const user = await User.findOne({ email });
  // Same wording as a wrong code: this shouldn't say whether the account exists
  if (!user) return res.status(400).json({ error: 'That code has expired. Ask for a new one.', code: 'CODE_EXPIRED' });

  const issue = passwordProblem(password, { name: user.name, email, username: user.username });
  if (issue) return res.status(400).json({ error: issue });

  const problem = await checkCode(user, code, 'reset');
  if (problem) return res.status(400).json(problem);

  user.password = await bcrypt.hash(password, 10);
  // Reading the code proves the address belongs to them
  user.emailVerified = true;
  await user.save();
  rememberVerified(user._id);

  setAuthCookie(res, user._id);
  res.json({ user });
});

// POST /api/auth/password/change { currentPassword, newPassword } — from the
// profile, for someone who knows their password. Their messages stay readable:
// the browser re-locks the same encryption key with the new password afterwards.
router.post('/password/change', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  const user = await User.findById(req.userId).select('+password');
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const matches = await bcrypt.compare(currentPassword, user.password);
  if (!matches) return res.status(401).json({ error: 'That isn’t your current password.' });

  const issue = passwordProblem(newPassword, { name: user.name, email: user.email, username: user.username });
  if (issue) return res.status(400).json({ error: issue });

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ changed: true });
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
