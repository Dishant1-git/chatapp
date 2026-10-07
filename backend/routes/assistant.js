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

// POST /api/assistant/command { text } → { action, name, text, say }
router.post('/command', assistantLimiter, async (req, res) => {
  const command = String(req.body?.text || '').trim().slice(0, MAX_COMMAND);
  if (!command) return res.status(400).json({ error: 'I didn’t catch that.' });
  res.json(await understand(command));
});

export default router;
