import { TOKEN_COOKIE, verifyToken } from '../utils/jwt.js';

// Protects a route: only logged-in users get through, and req.userId is set
// from the signed cookie. Never trust a user id sent in the request body.
export function requireAuth(req, res, next) {
  const userId = verifyToken(req.cookies[TOKEN_COOKIE]);
  if (!userId) return res.status(401).json({ error: 'Please log in.' });
  req.userId = userId;
  next();
}
