import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/calls/config — the STUN/TURN servers browsers use to connect calls.
// STUN is enough on most home networks. Behind strict firewalls and on some
// mobile networks calls only connect through a TURN server, so set TURN_URL,
// TURN_USERNAME and TURN_CREDENTIAL in production.
router.get('/config', requireAuth, (req, res) => {
  const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  const iceServers = [{ urls: stunUrls }];

  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map((url) => url.trim()),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }

  res.json({ iceServers });
});

export default router;
