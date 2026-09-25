import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { PARTICIPANT_FIELDS } from './conversations.js';

const router = Router();
const PAGE_SIZE = 40;

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

// GET /api/calls/history?before=<callId> — 📞 the call log: every call in the
// chats I'm part of, newest first. Calls are stored as notes in the chat itself
// (messages with event.type 'call'), so this gathers them across conversations.
router.get('/history', requireAuth, async (req, res) => {
  const me = req.userId;

  // Only chats I'm still in, and not ones I've hidden
  const conversations = await Conversation.find({ participants: me, hiddenFor: { $ne: me } })
    .select('_id type name image participants nicknames')
    .populate('participants', PARTICIPANT_FIELDS)
    .lean();

  if (!conversations.length) return res.json({ calls: [], hasMore: false });

  const filter = {
    conversationId: { $in: conversations.map((c) => c._id) },
    messageType: 'event',
    'event.type': 'call',
    isDeleted: false,
    deletedFor: { $ne: me },
  };
  // Paging: everything older than the last row we sent
  const before = String(req.query.before || '');
  if (before && isValidObjectId(before)) filter._id = { $lt: before };

  const found = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(PAGE_SIZE + 1)
    .select('conversationId senderId event createdAt')
    .lean();

  const hasMore = found.length > PAGE_SIZE;
  const byId = new Map(conversations.map((c) => [String(c._id), c]));

  const calls = found.slice(0, PAGE_SIZE).map((call) => {
    const conversation = byId.get(String(call.conversationId));
    const isGroup = conversation?.type === 'group';
    const other = isGroup ? null : (conversation?.participants || []).find((p) => String(p._id) !== String(me));
    return {
      _id: call._id,
      conversationId: call.conversationId,
      at: call.createdAt,
      video: Boolean(call.event?.video),
      // Seconds; 0 means nobody answered
      duration: call.event?.duration || 0,
      // 'ended' | 'declined' | 'no-answer' — older calls have no reason saved
      reason: call.event?.reason || '',
      // I started it, or it came in
      outgoing: String(call.senderId) === String(me),
      isGroup,
      // Enough to draw the row without looking anything else up
      name: isGroup ? conversation?.name || 'Group' : other?.name || 'Someone',
      image: isGroup ? conversation?.image || '' : other?.profileImage || '',
      otherUserId: other ? String(other._id) : null,
    };
  });

  res.json({ calls, hasMore });
});

export default router;
