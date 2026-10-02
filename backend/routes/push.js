import { Router } from 'express';
import PushSubscription from '../models/PushSubscription.js';
import { pushPublicKey } from '../utils/push.js';

// 🔔 Push notifications: browsers sign up here to be told about new messages.
// See utils/push.js for what is sent and when.

const router = Router();

// How many browsers one account can have signed up; the oldest make way
const MAX_PER_USER = 10;

// GET /api/push/config — the key a browser needs to subscribe ('' = push is off
// on this server, so the app hides the switch)
router.get('/config', (req, res) => {
  res.json({ key: pushPublicKey() });
});

// POST /api/push/subscribe { subscription } — this browser wants notifications
// for my account. A browser belongs to whoever signed in on it last.
router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body?.subscription || {};
  const valid =
    typeof endpoint === 'string' &&
    /^https:\/\//.test(endpoint) &&
    endpoint.length <= 2048 &&
    typeof keys?.p256dh === 'string' &&
    typeof keys?.auth === 'string';
  if (!valid || !pushPublicKey()) return res.status(400).json({ error: 'Notifications could not be turned on.' });

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId: req.userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { upsert: true, runValidators: true }
  );

  const extra = await PushSubscription.find({ userId: req.userId }).sort({ updatedAt: -1 }).skip(MAX_PER_USER).select('_id');
  if (extra.length) await PushSubscription.deleteMany({ _id: { $in: extra.map((s) => s._id) } });

  res.json({ ok: true });
});

// POST /api/push/unsubscribe { endpoint } — this browser stops getting them
router.post('/unsubscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint === 'string') await PushSubscription.deleteOne({ endpoint, userId: req.userId });
  res.json({ ok: true });
});

export default router;
