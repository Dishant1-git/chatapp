import User from '../models/User.js';
import { TOKEN_COOKIE, verifyToken } from '../utils/jwt.js';

// Protects a route: only logged-in users get through, and req.userId is set
// from the signed cookie. Never trust a user id sent in the request body.
export function requireAuth(req, res, next) {
  const userId = verifyToken(req.cookies[TOKEN_COOKIE]);
  if (!userId) return res.status(401).json({ error: 'Please log in.' });
  req.userId = userId;
  next();
}

// ✉️ Everything except logging in and verifying waits until the address behind
// the account has been confirmed with the code we emailed. Checked here, not
// only in the browser, so an unverified account can't just call the API.
export async function requireVerified(req, res, next) {
  const userId = verifyToken(req.cookies[TOKEN_COOKIE]);
  if (!userId) return res.status(401).json({ error: 'Please log in.' });

  const user = await User.findById(userId).select('emailVerified');
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  if (!user.emailVerified) {
    return res.status(403).json({ error: 'Please confirm your email address first.', code: 'EMAIL_NOT_VERIFIED' });
  }

  req.userId = userId;
  next();
}
