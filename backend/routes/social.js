// The playful side of Ghosted: ghost levels and forgiveness, "exit without
// drama", reviving dead chats, inside-joke badges, "undo seen" and the
// "read the vibe" stats with the connection streak.
import { Router } from 'express';
import mongoose from 'mongoose';
import Conversation, { MAX_BADGES, PAUSE_REASONS, formatBadges, formatPause } from '../models/Conversation.js';
import Message, { REFRESH_TICKS } from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, findMyConversation, resumeConversation } from './conversations.js';
import { GHOST_LEVELS, formatGhost, isOnlyEmoji } from '../utils/ghost.js';
import { bumpStat, emitMessageUpdate, publishEvent, useDailyAllowance } from '../utils/publish.js';
import { emitToConversation } from '../socket/io.js';
import { leaveCallsFor } from '../socket/calls.js';

const router = Router();
router.use(requireAuth);

const DEAD_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const UNDO_SEEN_PER_DAY = 3;

// Loads a one-to-one chat I'm in
async function findMyDirectChat(req, res) {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return null;
  if (conversation.type === 'group') {
    badRequest(res, 'This only works in one-to-one chats.');
    return null;
  }
  return conversation;
}

const otherPerson = (conversation, userId) => conversation.participants.find((p) => String(p) !== String(userId));

function emitGhost(conversation) {
  emitToConversation(conversation._id, 'conversation:ghost', {
    conversationId: String(conversation._id),
    ghost: formatGhost(conversation.ghost),
  });
}

// ---- 👻 Ghost levels ----

// POST /api/conversations/:id/ghost { level } — ghost the other person, or change the level
router.post('/:id/ghost', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;

  const level = String(req.body?.level || 'ghosted');
  if (!GHOST_LEVELS.includes(level)) return badRequest(res, 'Unknown ghost level.');

  if (conversation.ghost?.by && String(conversation.ghost.by) !== req.userId) {
    return res.status(409).json({ error: "You can't ghost someone who is ghosting you." });
  }

  const isNew = !conversation.ghost?.by;
  const updated = await Conversation.findOneAndUpdate(
    isNew ? { _id: conversation._id, ghost: null } : { _id: conversation._id, 'ghost.by': req.userId },
    isNew ? { ghost: { by: req.userId, level, since: new Date() } } : { 'ghost.level': level },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(409).json({ error: 'This chat just changed. Please try again.' });

  if (isNew) await bumpStat(req.userId, 'ghosted');
  if (level !== 'soft') leaveCallsFor(conversation._id, otherPerson(conversation, req.userId));
  emitGhost(updated);
  res.json({ ghost: formatGhost(updated.ghost) });
});

// Removes the ghost. The last thing the ghoster said before ghosting gets
// "🕊️ Character development", and a pending request counts as forgiven.
async function unghost(conversation, userId) {
  const { ghost } = conversation;
  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id, 'ghost.by': userId },
    { ghost: null },
    { returnDocument: 'after' }
  );
  if (!updated) return null;

  if (ghost.requestId) {
    await Message.updateOne({ _id: ghost.requestId }, { 'forgiveness.status': 'forgiven' });
    emitMessageUpdate(conversation._id, ghost.requestId, { forgiveness: { status: 'forgiven' } });
  }

  const since = ghost.since ? new Date(ghost.since) : new Date();
  const lastWords = await Message.findOne({
    conversationId: conversation._id,
    senderId: userId,
    messageType: { $ne: 'event' },
    isDeleted: false,
    createdAt: { $lte: since, $gte: new Date(since.getTime() - 7 * 24 * 60 * 60 * 1000) },
  }).sort({ _id: -1 });
  if (lastWords) {
    await Message.updateOne({ _id: lastWords._id }, { badge: 'growth' });
    emitMessageUpdate(conversation._id, lastWords._id, { badge: 'growth' });
  }

  await bumpStat(userId, 'forgave');
  emitGhost(updated);
  await publishEvent(updated, userId, { type: 'forgiven' });
  return updated;
}

// DELETE /api/conversations/:id/ghost — stop ghosting (only the one who ghosted can)
router.delete('/:id/ghost', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;
  if (String(conversation.ghost?.by) !== req.userId) {
    return res.status(404).json({ error: "You aren't ghosting anyone in this chat." });
  }
  await unghost(conversation, req.userId);
  res.json({ ghost: null });
});

// POST /api/conversations/:id/ghost/answer { answer: 'forgive' | 'keep' }
// The ghoster's reply to a forgiveness request. ("Ask me later" is just not answering yet.)
router.post('/:id/ghost/answer', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;

  const { ghost } = conversation;
  if (String(ghost?.by) !== req.userId || !ghost.requestId) {
    return res.status(409).json({ error: "There's no forgiveness request waiting for you." });
  }

  if (req.body?.answer === 'forgive') {
    await unghost(conversation, req.userId);
    return res.json({ ghost: null });
  }
  if (req.body?.answer !== 'keep') return badRequest(res, 'Answer "forgive" or "keep".');

  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id, 'ghost.by': req.userId, 'ghost.requestId': ghost.requestId },
    { 'ghost.requestId': null },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(409).json({ error: 'This chat just changed. Please try again.' });

  await Message.updateOne({ _id: ghost.requestId }, { 'forgiveness.status': 'declined' });
  emitMessageUpdate(conversation._id, ghost.requestId, { forgiveness: { status: 'declined' } });
  emitGhost(updated);
  await publishEvent(updated, req.userId, { type: 'stillGhosted' });
  res.json({ ghost: formatGhost(updated.ghost) });
});

// ---- 🚪 Exit without drama ----

// POST /api/conversations/:id/pause { reason } — step away from a one-to-one chat.
// It disappears from my list and they can't message or call until I come back.
router.post('/:id/pause', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;

  const reason = String(req.body?.reason || '');
  if (!PAUSE_REASONS.includes(reason)) return badRequest(res, 'Pick a reason.');
  if (conversation.pausedBy?.by && String(conversation.pausedBy.by) !== req.userId) {
    return res.status(409).json({ error: "They've already stepped away from this chat." });
  }

  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id },
    { pausedBy: { by: req.userId, reason, at: new Date() } },
    { returnDocument: 'after' }
  );
  leaveCallsFor(conversation._id, req.userId);
  emitToConversation(conversation._id, 'conversation:pause', {
    conversationId: String(conversation._id),
    pausedBy: formatPause(updated.pausedBy),
  });
  await publishEvent(updated, req.userId, { type: 'paused', reason });
  res.json({ pausedBy: formatPause(updated.pausedBy) });
});

// DELETE /api/conversations/:id/pause — come back
router.delete('/:id/pause', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;
  await resumeConversation(conversation, req.userId);
  res.json({ pausedBy: null });
});

// ---- 🪦 Dead chats and 🧟 revive ----

// POST /api/conversations/:id/revive — "Should we revive this?" (after 30 quiet days)
router.post('/:id/revive', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;
  if (conversation.pausedBy?.by) return res.status(403).json({ error: 'This chat is paused.' });
  if (Date.now() - new Date(conversation.lastMessageAt).getTime() < DEAD_AFTER_MS) {
    return badRequest(res, "This chat isn't dead yet.");
  }
  const message = await publishEvent(conversation, req.userId, { type: 'revive', answer: '' });
  res.status(201).json({ message });
});

// POST /api/conversations/:id/revive/:messageId { answer: 'yes' | 'maybe' | 'no' }
router.post('/:id/revive/:messageId', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;

  const answer = String(req.body?.answer || '');
  if (!['yes', 'maybe', 'no'].includes(answer)) return badRequest(res, 'Answer yes, maybe or no.');

  const message = await Message.findOneAndUpdate(
    {
      _id: mongoose.isValidObjectId(req.params.messageId) ? req.params.messageId : null,
      conversationId: conversation._id,
      'event.type': 'revive',
      'event.answer': '',
      senderId: { $ne: req.userId },
    },
    { 'event.answer': answer },
    { returnDocument: 'after' }
  );
  if (!message) return res.status(404).json({ error: 'This revive request was already answered.' });

  if (answer === 'yes') await Promise.all(conversation.participants.map((id) => bumpStat(id, 'revived')));
  emitMessageUpdate(conversation._id, message._id, { event: message.toJSON().event });
  res.json({ answer });
});

// ---- 🧩 Inside-joke badges ----

function emitBadges(conversation) {
  emitToConversation(conversation._id, 'conversation:updated', {
    conversation: { _id: String(conversation._id), badges: formatBadges(conversation.badges) },
  });
}

// POST /api/conversations/:id/badges { emoji, label }
router.post('/:id/badges', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const emoji = String(req.body?.emoji || '').trim();
  const label = String(req.body?.label || '').trim();
  if (!emoji || emoji.length > 16 || !isOnlyEmoji(emoji)) return badRequest(res, 'Pick one emoji.');
  if (!label || label.length > 30) return badRequest(res, 'The name must be 1–30 characters.');

  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id, [`badges.${MAX_BADGES - 1}`]: { $exists: false } },
    { $push: { badges: { emoji, label, by: req.userId } } },
    { returnDocument: 'after' }
  );
  if (!updated) return badRequest(res, `A chat can have at most ${MAX_BADGES} inside jokes.`);

  emitBadges(updated);
  res.status(201).json({ badges: formatBadges(updated.badges) });
});

// DELETE /api/conversations/:id/badges/:badgeId — anyone in the chat can remove one
router.delete('/:id/badges/:badgeId', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;
  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id },
    { $pull: { badges: { _id: mongoose.isValidObjectId(req.params.badgeId) ? req.params.badgeId : null } } },
    { returnDocument: 'after' }
  );
  emitBadges(updated);
  res.json({ badges: formatBadges(updated.badges) });
});

// ---- 👀 Undo seen ----

// POST /api/conversations/:id/unread — "Oops, I didn't mean to open that".
// Marks the messages they sent since my last message as unread again (3 times a day).
router.post('/:id/unread', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const me = new mongoose.Types.ObjectId(req.userId);
  const myLast = await Message.findOne({ conversationId: conversation._id, senderId: me, messageType: { $ne: 'event' } })
    .sort({ _id: -1 })
    .select('_id');
  const seen = await Message.find({
    conversationId: conversation._id,
    recipients: me,
    readBy: me,
    ...(myLast && { _id: { $gt: myLast._id } }),
  })
    .sort({ _id: -1 })
    .limit(50)
    .select('_id');
  if (!seen.length) return badRequest(res, 'Nothing to undo.');

  const remaining = await useDailyAllowance(req.userId, 'undoSeen', UNDO_SEEN_PER_DAY);
  if (remaining < 0) return res.status(429).json({ error: `You can undo "seen" ${UNDO_SEEN_PER_DAY} times a day.` });

  const ids = seen.map((m) => m._id);
  await Message.updateMany({ _id: { $in: ids } }, [{ $set: { readBy: { $setDifference: ['$readBy', [me]] } } }, ...REFRESH_TICKS], {
    updatePipeline: true,
  });
  emitToConversation(conversation._id, 'messages:unread', {
    conversationId: String(conversation._id),
    readerId: req.userId,
    messageIds: ids.map(String),
  });
  res.json({ unread: ids.length, remaining });
});

// ---- 🧠 Read the vibe + 🔥 connection streak ----

// "+05:30" → 330 (minutes east of UTC)
function parseOffset(tz) {
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(String(tz || ''));
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return Math.min(14 * 60, minutes) * (match[1] === '-' ? -1 : 1);
}

function localDay(date, offsetMin) {
  return new Date(date.getTime() + offsetMin * 60000).toISOString().slice(0, 10);
}

// Consecutive "meaningful" days ending today (or yesterday, since today isn't over yet).
// A day counts when both people talked and there were 5+ messages, or there was a call or a "miss you".
function connectionStreak(days, offsetMin) {
  const qualifies = (day) => {
    const d = days.get(day);
    return Boolean(d && ((d.senders.size >= 2 && d.count >= 5) || d.special));
  };
  const cursor = new Date();
  if (!qualifies(localDay(cursor, offsetMin))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (qualifies(localDay(cursor, offsetMin))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// A playful label — not an analysis of anyone
function vibeLabel(stats) {
  const { messages, laughs, lateNight, avgReplySeconds, perPerson, calls, missYous } = stats;
  const counts = Object.values(perPerson);
  const imbalance = counts.length === 2 ? Math.max(...counts) / Math.max(1, Math.min(...counts)) : 1;
  if (messages < 10) return 'just getting started 🌱';
  if (lateNight / messages > 0.3) return '3am philosophers 🌙';
  if (laughs / messages > 0.08) return 'chaotic good 😂';
  if (avgReplySeconds && avgReplySeconds < 120) return 'speedrunning replies ⚡';
  if (imbalance > 3) return 'one of you is in yap mode 🗣️';
  if (calls >= 3) return 'voice over text 📞';
  if (missYous >= 2) return 'certified softies 💕';
  return 'wholesome & steady 🫶';
}

// GET /api/conversations/:id/insights?tz=+05:30
router.get('/:id/insights', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const offsetMin = parseOffset(req.query.tz);
  const messages = await Message.find({ conversationId: conversation._id, isDeleted: false })
    .sort({ _id: -1 })
    .limit(5000)
    .select('senderId createdAt messageType reactions event')
    .lean();
  messages.reverse();

  const stats = { messages: 0, photos: 0, reactions: 0, laughs: 0, calls: 0, callMinutes: 0, missYous: 0, lateNight: 0 };
  const perPerson = {};
  const days = new Map();
  let replyTotal = 0;
  let replyCount = 0;
  let previous = null;

  for (const m of messages) {
    const day = localDay(m.createdAt, offsetMin);
    if (!days.has(day)) days.set(day, { count: 0, senders: new Set(), special: false });
    const d = days.get(day);

    if (m.messageType === 'event') {
      if (m.event?.type === 'call' && m.event.duration) {
        stats.calls += 1;
        stats.callMinutes += Math.round(m.event.duration / 60);
        d.special = true;
      }
      if (m.event?.type === 'missYou') {
        stats.missYous += 1;
        d.special = true;
      }
      continue;
    }

    const sender = String(m.senderId);
    stats.messages += 1;
    if (m.messageType === 'image') stats.photos += 1;
    perPerson[sender] = (perPerson[sender] || 0) + 1;
    d.count += 1;
    d.senders.add(sender);

    const hour = new Date(m.createdAt.getTime() + offsetMin * 60000).getUTCHours();
    if (hour < 4) stats.lateNight += 1;

    for (const r of m.reactions || []) {
      stats.reactions += 1;
      if (!r.anonymous && r.emoji === '😂') stats.laughs += 1;
    }

    // Reply time: how long until the other person answered (gaps over 12h don't count)
    if (previous && previous.sender !== sender) {
      const gap = (m.createdAt - previous.at) / 1000;
      if (gap < 12 * 3600) {
        replyTotal += gap;
        replyCount += 1;
      }
    }
    previous = { sender, at: m.createdAt };
  }

  const result = {
    ...stats,
    perPerson,
    avgReplySeconds: replyCount ? Math.round(replyTotal / replyCount) : null,
    streak: conversation.type === 'group' ? 0 : connectionStreak(days, offsetMin),
  };
  result.vibe = vibeLabel(result);
  res.json(result);
});

export default router;
