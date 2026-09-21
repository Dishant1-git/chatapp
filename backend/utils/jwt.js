import jwt from 'jsonwebtoken';

export const TOKEN_COOKIE = 'token';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

function signToken(userId) {
  return jwt.sign({ userId: String(userId) }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Returns the user id, or null if the token is missing, invalid or expired
export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).userId || null;
  } catch {
    return null;
  }
}

function cookieOptions() {
  // "lax" works when the browser reaches the API through the frontend (the default setup).
  // Set COOKIE_SAME_SITE=none if the frontend calls the API on a different domain directly.
  const sameSite = process.env.COOKIE_SAME_SITE || 'lax';
  return {
    httpOnly: true, // JavaScript in the browser can't read it
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: '/',
  };
}

export function setAuthCookie(res, userId) {
  res.cookie(TOKEN_COOKIE, signToken(userId), { ...cookieOptions(), maxAge: TOKEN_MAX_AGE });
}

export function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE, cookieOptions());
}
