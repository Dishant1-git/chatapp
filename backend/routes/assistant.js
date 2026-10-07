import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { assistantLimiter } from '../middleware/rateLimits.js';
import { understand } from '../utils/assistant.js';

// 🎙️ Voice commands (see utils/assistant.js). The server only works out what
// was asked for; calling and sending happen in the browser, which is the only
// place that can encrypt a message or open a microphone.

const router = Router();
router.use(requireAuth);

const MAX_COMMAND = 400;
const MAX_TZ = 14 * 60;

// POST /api/assistant/command { text, tz } → { action, name, text, when, option, extra, say }
// tz: the speaker's clock, in minutes east of UTC — "at 5 pm" means theirs
router.post('/command', assistantLimiter, async (req, res) => {
  const command = String(req.body?.text || '').trim().slice(0, MAX_COMMAND);
  if (!command) return res.status(400).json({ error: 'I didn’t catch that.' });
  const tz = Math.max(-MAX_TZ, Math.min(MAX_TZ, Math.round(Number(req.body?.tz)) || 0));
  res.json(await understand(command, tz));
});

export default router;
