import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

function limiter(windowMinutes, limit, message, keyGenerator) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: message },
    ...(keyGenerator && { keyGenerator }),
  });
}

// Login attempts are counted per email address, so guessing one account's
// password is blocked no matter how many IP addresses the attacker uses.
export const loginLimiter = limiter(
  15,
  10,
  'Too many login attempts. Please wait a few minutes and try again.',
  (req) => String(req.body?.email || '').trim().toLowerCase() || ipKeyGenerator(req.ip)
);

// Sign-ups are counted per IP address (see "trust proxy" in app.js)
export const registerLimiter = limiter(60, 20, 'Too many sign-up attempts. Please try again later.');

// Logged-in actions are counted per user
export const messageLimiter = limiter(1, 60, 'You are sending messages too quickly. Slow down a little.', (req) => req.userId);
export const uploadLimiter = limiter(10, 30, 'You are uploading too many images. Please wait a bit.', (req) => req.userId);
export const keyLimiter = limiter(60, 10, 'Too many encryption key changes. Please try again later.', (req) => req.userId);
export const groupLimiter = limiter(10, 60, 'Too many group changes. Please wait a bit.', (req) => req.userId);
