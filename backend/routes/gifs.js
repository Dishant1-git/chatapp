import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { searchLimiter } from '../middleware/rateLimits.js';

// 🎞️ GIF search, proxied through here so the API key stays on the server and
// the browser never talks to GIPHY directly.
// Set GIPHY_API_KEY in backend/.env to switch it on; without it the app simply
// doesn't show the GIF tab.

const router = Router();
router.use(requireAuth);

const GIPHY = 'https://api.giphy.com/v1/gifs';
const MAX_GIF_BYTES = 5 * 1024 * 1024;

function apiKey() {
  return String(process.env.GIPHY_API_KEY || '').trim();
}

// What the picker shows: a small still-ish preview and the GIF to send
function formatGif(gif) {
  const send = gif.images?.fixed_height || gif.images?.downsized_medium || gif.images?.original;
  const preview = gif.images?.fixed_height_small || gif.images?.preview_gif || send;
  if (!send?.url) return null;
  return {
    id: gif.id,
    title: gif.title || 'GIF',
    url: send.url,
    preview: preview.url,
    width: Number(send.width) || 0,
    height: Number(send.height) || 0,
  };
}

// GET /api/gifs/config — whether this server can search GIFs at all, so the
// app can hide the GIF tab instead of showing one that fails when tapped
router.get('/config', (req, res) => {
  res.json({ available: Boolean(apiKey()) });
});

// GET /api/gifs?q=  — search, or what's trending when q is empty
router.get('/', searchLimiter, async (req, res) => {
  const key = apiKey();
  if (!key) return res.status(503).json({ error: 'GIF search is not set up on this server.', code: 'NO_GIF_KEY' });

  const q = String(req.query.q || '').trim().slice(0, 60);
  const params = new URLSearchParams({ api_key: key, limit: '24', rating: 'pg-13', bundle: 'messaging_non_clips' });
  if (q) params.set('q', q);

  try {
    const response = await fetch(`${GIPHY}/${q ? 'search' : 'trending'}?${params}`);
    if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);
    const data = await response.json();
    res.json({ gifs: (data.data || []).map(formatGif).filter(Boolean) });
  } catch {
    res.status(502).json({ error: "Couldn't reach the GIF service. Please try again." });
  }
});

// GET /api/gifs/file?url= — fetches the chosen GIF so the browser can encrypt
// and send it like any other picture (and so no request leaves for GIPHY from
// the user's own browser)
router.get('/file', searchLimiter, async (req, res) => {
  if (!apiKey()) return res.status(503).json({ error: 'GIF search is not set up on this server.' });

  let url;
  try {
    url = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'Invalid GIF.' });
  }
  // Only GIPHY's own media hosts
  if (url.protocol !== 'https:' || !/(^|\.)giphy\.com$/.test(url.hostname)) {
    return res.status(400).json({ error: 'Invalid GIF.' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error('not an image');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_GIF_BYTES) return res.status(413).json({ error: 'That GIF is too large.' });

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch {
    res.status(502).json({ error: "Couldn't download that GIF." });
  }
});

export default router;
