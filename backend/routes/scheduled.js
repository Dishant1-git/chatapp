// ⏰ Scheduled messages: write one message, pick several people and a time,
// and it's sent to each of them (in your one-to-one chat) at that time.
import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import Conversation, { blockError } from '../models/Conversation.js';
import ScheduledMessage, {
  MAX_PENDING_SCHEDULED,
  MAX_SCHEDULED_RECIPIENTS,
  MAX_SCHEDULE_AHEAD_MS,
} from '../models/ScheduledMessage.js';
import { requireAuth } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimits.js';
import { checkEncrypted } from '../utils/encrypted.js';

const router = Router();
router.use(requireAuth);

// Sent ones stay in the list for a week, so you can see they went out
const SHOW_DONE_FOR_MS = 7 * 24 * 60 * 60 * 1000;

// GET /api/scheduled — my scheduled messages, soonest first
router.get('/', async (req, res) => {
  const scheduled = await ScheduledMessage.find({
    senderId: req.userId,
    $or: [{ status: { $in: ['pending', 'sending'] } }, { sendAt: { $gte: new Date(Date.now() - SHOW_DONE_FOR_MS) } }],
  })
    .sort({ sendAt: 1 })
    .populate('items.recipientId', 'name profileImage')
    .lean();
  res.json({ scheduled });
});

// POST /api/scheduled { sendAt, items: [{ conversationId, ciphertext, iv, senderKey, keys }] }
// The browser encrypts the message once per chat, like sending it now would.
router.post('/', messageLimiter, async (req, res) => {
  const sendAt = new Date(req.body?.sendAt);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (Number.isNaN(sendAt.getTime())) return res.status(400).json({ error: 'Pick a date and time.' });
  if (sendAt.getTime() <= Date.now()) return res.status(400).json({ error: 'Pick a time in the future.' });
  if (sendAt.getTime() - Date.now() > MAX_SCHEDULE_AHEAD_MS) {
    return res.status(400).json({ error: 'You can schedule up to a year ahead.' });
  }
  if (!items.length) return res.status(400).json({ error: 'Choose at least one person.' });
  if (items.length > MAX_SCHEDULED_RECIPIENTS) {
    return res.status(400).json({ error: `You can send a scheduled message to up to ${MAX_SCHEDULED_RECIPIENTS} people.` });
  }

  const pending = await ScheduledMessage.countDocuments({ senderId: req.userId, status: 'pending' });
  if (pending >= MAX_PENDING_SCHEDULED) {
    return res.status(429).json({ error: `You can have up to ${MAX_PENDING_SCHEDULED} scheduled messages waiting.` });
  }

  const conversationIds = items.map((item) => String(item?.conversationId || ''));
  if (!conversationIds.every(isValidObjectId) || new Set(conversationIds).size !== conversationIds.length) {
    return res.status(400).json({ error: 'Invalid recipients.' });
  }

  // Every copy goes to a one-to-one chat of mine, encrypted for both of us
  const saved = [];
  for (const item of items) {
    const conversation = await Conversation.findOne({ _id: item.conversationId, participants: req.userId });
    if (!conversation || conversation.type === 'group') {
      return res.status(404).json({ error: 'One of these chats was not found.' });
    }
    const blocked = blockError(conversation, req.userId);
    if (blocked) return res.status(403).json({ error: blocked });

    const checked = await checkEncrypted(conversation, item, req.userId);
    if (checked.error) return res.status(checked.status).json({ error: checked.error, code: checked.code });

    saved.push({
      conversationId: conversation._id,
      recipientId: conversation.participants.find((p) => String(p) !== req.userId),
      ciphertext: String(item.ciphertext),
      iv: String(item.iv),
      senderKey: String(item.senderKey),
      keys: checked.keys,
    });
  }

  const scheduled = await ScheduledMessage.create({ senderId: req.userId, sendAt, items: saved });
  await scheduled.populate('items.recipientId', 'name profileImage');
  res.status(201).json({ scheduled });
});

// DELETE /api/scheduled/:id — cancel it (only while it hasn't gone out yet)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(404).json({ error: 'Scheduled message not found.' });

  const cancelled = await ScheduledMessage.findOneAndUpdate(
    { _id: id, senderId: req.userId, status: 'pending' },
    { status: 'cancelled' },
    { returnDocument: 'after' }
  );
  if (!cancelled) {
    const exists = await ScheduledMessage.exists({ _id: id, senderId: req.userId });
    return res
      .status(exists ? 409 : 404)
      .json({ error: exists ? 'It has already been sent.' : 'Scheduled message not found.' });
  }
  res.json({ success: true });
});

export default router;
