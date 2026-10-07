import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { booLimiter } from '../middleware/rateLimits.js';
import { GHOST_LEVELS } from '../utils/ghost.js';
import { booGhosted, booReply } from '../utils/boo.js';

// 👻 Boo, the app's own ghost (see utils/boo.js). Boo isn't a user and has no
// conversation in the database: the browser pins Boo to the top of the chat
// list and keeps that chat's history itself. What's typed to Boo is sent to
// Grok as it is — it's the one chat in the app that isn't end-to-end encrypted,
// and Boo's chat screen says so.

const router = Router();
router.use(requireAuth);

const MAX_TURNS = 12;
const MAX_TURN_LENGTH = 600;

// POST /api/boo/chat { messages: [{ role: 'user' | 'assistant', content }] } → { reply }
router.post('/chat', booLimiter, async (req, res) => {
  const list = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const history = list
    .slice(-MAX_TURNS)
    .map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content || '').trim().slice(0, MAX_TURN_LENGTH),
    }))
    .filter((m) => m.content);

  if (!history.length || history.at(-1).role !== 'user') {
    return res.status(400).json({ error: 'Say something to Boo first.' });
  }
  res.json(await booReply(history));
});

// POST /api/boo/ghosted { level, canSend } → { joke, suggestions }
// For someone looking at a chat they've been ghosted in. Only the level is
// needed, so nothing about the chat or the people in it is looked up or sent on.
router.post('/ghosted', booLimiter, async (req, res) => {
  const level = String(req.body?.level || '');
  if (!GHOST_LEVELS.includes(level)) return res.status(400).json({ error: 'Unknown ghost level.' });
  res.json(await booGhosted(level, req.body?.canSend === true));
});

export default router;
