import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose, { isValidObjectId } from 'mongoose';
import Conversation, { MAX_GROUP_MEMBERS, conversationKey, formatConversation } from '../models/Conversation.js';
import Message, { REPLY_FIELDS, REFRESH_TICKS } from '../models/Message.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { groupLimiter } from '../middleware/rateLimits.js';
import { saveImage } from '../utils/storage.js';
import { publishEvent } from '../utils/publish.js';
import { formatGhost } from '../utils/ghost.js';
import { getIO, userRoom, conversationRoom, emitToConversation } from '../socket/io.js';
import { leaveCallsFor } from '../socket/calls.js';

const router = Router();
router.use(requireAuth);

export const PARTICIPANT_FIELDS = 'name email profileImage isOnline lastSeen publicKey keyId';
const PAGE_SIZE = 30;

function badRequest(res, error) {
  res.status(400).json({ error });
}

// Loads a conversation only if the logged-in user is part of it
async function findMyConversation(req, res) {
  const { id } = req.params;
  const conversation = isValidObjectId(id)
    ? await Conversation.findOne({ _id: id, participants: req.userId })
    : null;
  if (!conversation) res.status(404).json({ error: 'Conversation not found.' });
  return conversation;
}

// Loads a group I'm in; with adminOnly, I must also be one of its admins
async function findMyGroup(req, res, { adminOnly = false } = {}) {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return null;
  if (conversation.type !== 'group') {
    res.status(400).json({ error: 'This is not a group.' });
    return null;
  }
  if (adminOnly && !conversation.admins.some((a) => String(a) === req.userId)) {
    res.status(403).json({ error: 'Only group admins can do that.' });
    return null;
  }
  return conversation;
}

function isParticipant(conversation, userId) {
  return conversation.participants.some((p) => String(p) === String(userId));
}

// Accepts ["id", ...] or a JSON string of it (multipart forms send strings)
function parseIdList(value) {
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  const ids = [...new Set(list.map(String))];
  return ids.every(isValidObjectId) ? ids : null;
}

function cleanGroupName(value) {
  const name = String(value || '').trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

// Puts (or removes) all open connections of these users in the conversation's room
function joinRoom(userIds, conversationId) {
  const io = getIO();
  if (!io) return;
  userIds.forEach((id) => io.in(userRoom(id)).socketsJoin(conversationRoom(conversationId)));
}

function leaveRoom(userIds, conversationId) {
  const io = getIO();
  if (!io) return;
  userIds.forEach((id) => io.in(userRoom(id)).socketsLeave(conversationRoom(conversationId)));
}

// Tells everyone in a group about its new name, photo or members
async function broadcastGroup(conversation) {
  await conversation.populate('participants', PARTICIPANT_FIELDS);
  const { _id, name, image, participants, admins } = formatConversation(conversation, null);
  emitToConversation(conversation._id, 'conversation:updated', {
    conversation: { _id, name, image, participants, admins },
  });
  // Later code expects plain ids again
  conversation.depopulate('participants');
}

// GET /api/conversations — my conversations, newest first, with unread counts
router.get('/', async (req, res) => {
  // Empty conversations (opened but no message sent yet) are not listed
  const conversations = await Conversation.find({
    participants: req.userId,
    lastMessage: { $ne: null },
  })
    .sort({ lastMessageAt: -1 })
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage')
    .lean();

  // One query for all unread counts instead of one per conversation
  const me = new mongoose.Types.ObjectId(req.userId);
  const unread = await Message.aggregate([
    { $match: { recipients: me, readBy: { $ne: me }, isDeleted: false, deletedFor: { $ne: me } } },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);
  const unreadByConversation = Object.fromEntries(unread.map((u) => [String(u._id), u.count]));

  res.json({
    conversations: conversations.map((c) =>
      formatConversation(c, req.userId, unreadByConversation[String(c._id)] || 0)
    ),
  });
});

// POST /api/conversations { userId } — open the chat with a user,
// creating it only if it doesn't exist yet
router.post('/', async (req, res) => {
  const otherUserId = String(req.body?.userId || '');

  if (!isValidObjectId(otherUserId)) return badRequest(res, 'Invalid user.');
  if (otherUserId === req.userId) return badRequest(res, "You can't start a chat with yourself.");

  const otherUser = await User.exists({ _id: otherUserId });
  if (!otherUser) return res.status(404).json({ error: 'User not found.' });

  const key = conversationKey(req.userId, otherUserId);
  let conversation;
  try {
    // Upsert: returns the existing conversation or creates it atomically
    conversation = await Conversation.findOneAndUpdate(
      { key },
      {
        $setOnInsert: { key, type: 'direct', participants: [req.userId, otherUserId], lastMessageAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (err) {
    // Both users opened the chat at the exact same time — just load it
    if (err.code !== 11000) throw err;
    conversation = await Conversation.findOne({ key });
  }

  joinRoom([req.userId, otherUserId], conversation._id);

  await conversation.populate([
    { path: 'participants', select: PARTICIPANT_FIELDS },
    { path: 'lastMessage' },
  ]);

  res.json({ conversation: formatConversation(conversation, req.userId) });
});

// POST /api/conversations/groups — multipart: name, members (JSON array of user ids), image?
router.post('/groups', groupLimiter, imageUpload.single('image'), async (req, res) => {
  const name = cleanGroupName(req.body?.name);
  const members = parseIdList(req.body?.members);

  if (!name) return badRequest(res, 'Group name must be 1–60 characters.');
  if (!members) return badRequest(res, 'Invalid members.');

  const others = members.filter((id) => id !== req.userId);
  if (others.length < 1) return badRequest(res, 'Add at least one person to the group.');
  if (others.length + 1 > MAX_GROUP_MEMBERS) return badRequest(res, `A group can have at most ${MAX_GROUP_MEMBERS} members.`);

  const found = await User.countDocuments({ _id: { $in: others } });
  if (found !== others.length) return res.status(404).json({ error: 'Some of these people no longer exist.' });

  const image = req.file ? await saveImage(req.file.buffer, { maxSize: 400 }) : '';
  const participants = [req.userId, ...others];

  const conversation = await Conversation.create({
    type: 'group',
    key: `group:${crypto.randomBytes(12).toString('hex')}`,
    name,
    image,
    participants,
    admins: [req.userId],
    createdBy: req.userId,
  });

  joinRoom(participants, conversation._id);
  await publishEvent(conversation, req.userId, { type: 'created', name });

  // The creator gets the conversation in the response; the others add it
  // when its first message ("… created the group") arrives.
  await conversation.populate([
    { path: 'participants', select: PARTICIPANT_FIELDS },
    { path: 'lastMessage' },
  ]);
  res.status(201).json({ conversation: formatConversation(conversation, req.userId) });
});

// PATCH /api/conversations/:id — multipart: name?, image?, removeImage? (admins only)
router.patch('/:id', groupLimiter, imageUpload.single('image'), async (req, res) => {
  const conversation = await findMyGroup(req, res, { adminOnly: true });
  if (!conversation) return;

  const body = req.body || {};
  const events = [];

  if (body.name !== undefined) {
    const name = cleanGroupName(body.name);
    if (!name) return badRequest(res, 'Group name must be 1–60 characters.');
    if (name !== conversation.name) {
      conversation.name = name;
      events.push({ type: 'renamed', name });
    }
  }

  if (req.file) {
    conversation.image = await saveImage(req.file.buffer, { maxSize: 400 });
    events.push({ type: 'photo' });
  } else if (body.removeImage === 'true' && conversation.image) {
    conversation.image = '';
    events.push({ type: 'photo' });
  }

  await conversation.save();
  for (const event of events) await publishEvent(conversation, req.userId, event);
  await broadcastGroup(conversation);

  await conversation.populate([
    { path: 'participants', select: PARTICIPANT_FIELDS },
    { path: 'lastMessage' },
  ]);
  res.json({ conversation: formatConversation(conversation, req.userId) });
});

// POST /api/conversations/:id/members { userIds } — add people (admins only)
router.post('/:id/members', groupLimiter, async (req, res) => {
  const conversation = await findMyGroup(req, res, { adminOnly: true });
  if (!conversation) return;

  const ids = parseIdList(req.body?.userIds);
  if (!ids || ids.length === 0) return badRequest(res, 'Choose at least one person to add.');

  const newIds = ids.filter((id) => !isParticipant(conversation, id));
  if (newIds.length === 0) return badRequest(res, 'These people are already in the group.');
  if (conversation.participants.length + newIds.length > MAX_GROUP_MEMBERS) {
    return badRequest(res, `A group can have at most ${MAX_GROUP_MEMBERS} members.`);
  }

  const found = await User.countDocuments({ _id: { $in: newIds } });
  if (found !== newIds.length) return res.status(404).json({ error: 'Some of these people no longer exist.' });

  conversation.participants.push(...newIds);
  await conversation.save();

  joinRoom(newIds, conversation._id);
  // New members pick the group up from this message. They can't read anything
  // sent before they joined: those messages were never locked for them.
  await publishEvent(conversation, req.userId, { type: 'added', targets: newIds });
  await broadcastGroup(conversation);

  res.json({ success: true });
});

// DELETE /api/conversations/:id/members/:userId — remove someone (admins only),
// or leave the group when it's your own id
router.delete('/:id/members/:userId', groupLimiter, async (req, res) => {
  const targetId = String(req.params.userId);
  const isLeaving = targetId === req.userId;

  const conversation = await findMyGroup(req, res, { adminOnly: !isLeaving });
  if (!conversation) return;
  if (!isParticipant(conversation, targetId)) return res.status(404).json({ error: 'This person is not in the group.' });

  // Posted before removing them, so they see it as their last message too
  await publishEvent(
    conversation,
    req.userId,
    isLeaving ? { type: 'left' } : { type: 'removed', targets: [targetId] }
  );

  conversation.participants = conversation.participants.filter((p) => String(p) !== targetId);
  conversation.admins = conversation.admins.filter((a) => String(a) !== targetId);
  // A group always keeps an admin: promote the longest-standing member
  if (conversation.admins.length === 0 && conversation.participants.length > 0) {
    conversation.admins = [conversation.participants[0]];
  }
  await conversation.save();

  leaveRoom([targetId], conversation._id);
  leaveCallsFor(conversation._id, targetId);
  getIO()?.to(userRoom(targetId)).emit('conversation:removed', { conversationId: String(conversation._id) });
  await broadcastGroup(conversation);

  res.json({ success: true });
});

// POST /api/conversations/:id/admins/:userId — make someone an admin (admins only)
router.post('/:id/admins/:userId', groupLimiter, async (req, res) => {
  const conversation = await findMyGroup(req, res, { adminOnly: true });
  if (!conversation) return;

  const targetId = String(req.params.userId);
  if (!isParticipant(conversation, targetId)) return res.status(404).json({ error: 'This person is not in the group.' });

  if (!conversation.admins.some((a) => String(a) === targetId)) {
    conversation.admins.push(targetId);
    await conversation.save();
    await broadcastGroup(conversation);
  }

  res.json({ success: true });
});

// GET /api/conversations/:id
router.get('/:id', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  await conversation.populate([
    { path: 'participants', select: PARTICIPANT_FIELDS },
    { path: 'lastMessage' },
  ]);

  const unreadCount = await Message.countDocuments({
    conversationId: conversation._id,
    recipients: req.userId,
    readBy: { $ne: req.userId },
    isDeleted: false,
    deletedFor: { $ne: req.userId },
  });

  res.json({ conversation: formatConversation(conversation, req.userId, unreadCount) });
});

// GET /api/conversations/:id/messages?before=<messageId>
// One page of messages (oldest → newest). Pass the oldest loaded message id
// as "before" to get the previous page.
router.get('/:id/messages', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const filter = { conversationId: conversation._id, deletedFor: { $ne: req.userId } };
  const before = req.query.before;
  if (before && isValidObjectId(before)) filter._id = { $lt: before };

  // Fetch one extra message to know if there are more pages
  const messages = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(PAGE_SIZE + 1)
    .populate('replyTo', REPLY_FIELDS);

  const hasMore = messages.length > PAGE_SIZE;
  res.json({ messages: messages.slice(0, PAGE_SIZE).reverse(), hasMore });
});

// POST /api/conversations/:id/read — mark messages sent to me as read,
// then let the senders know (blue ticks)
router.post('/:id/read', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const me = new mongoose.Types.ObjectId(req.userId);
  const result = await Message.updateMany(
    { conversationId: conversation._id, recipients: me, readBy: { $ne: me } },
    [
      {
        $set: {
          readBy: { $setUnion: [{ $ifNull: ['$readBy', []] }, [me]] },
          deliveredTo: { $setUnion: [{ $ifNull: ['$deliveredTo', []] }, [me]] },
        },
      },
      ...REFRESH_TICKS,
    ],
    { updatePipeline: true }
  );

  if (result.modifiedCount > 0) {
    emitToConversation(conversation._id, 'messages:read', {
      conversationId: String(conversation._id),
      readerId: req.userId,
    });
  }

  res.json({ updated: result.modifiedCount });
});

// POST /api/conversations/:id/mute { muted } — only affects me
router.post('/:id/mute', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const isMuted = req.body?.muted === true;
  await Conversation.updateOne(
    { _id: conversation._id },
    isMuted ? { $addToSet: { mutedBy: req.userId } } : { $pull: { mutedBy: req.userId } }
  );

  // My other tabs and devices
  getIO()?.to(userRoom(req.userId)).emit('conversation:mute', {
    conversationId: String(conversation._id),
    isMuted,
  });

  res.json({ isMuted });
});

const MISS_YOU_COOLDOWN_MS = 60 * 1000;

// POST /api/conversations/:id/miss-you — tell the other person you miss them.
// It's a small note in the chat (no text), so it doesn't need encrypting.
// Their app shows floating hearts and suggests a sweet reply when they open the chat.
router.post('/:id/miss-you', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;
  if (conversation.type === 'group') return badRequest(res, 'You can only send this in a one-to-one chat.');

  // Ghosting limits what you can send; this mustn't be a way around it
  if (conversation.ghost?.by && String(conversation.ghost.by) !== req.userId) {
    return res.status(403).json({ error: "You can't send this while they're ghosting you." });
  }

  const recent = await Message.exists({
    conversationId: conversation._id,
    senderId: req.userId,
    'event.type': 'missYou',
    createdAt: { $gt: new Date(Date.now() - MISS_YOU_COOLDOWN_MS) },
  });
  if (recent) return res.status(429).json({ error: 'You just told them. Give it a minute 💕' });

  const message = await publishEvent(conversation, req.userId, { type: 'missYou' });
  res.status(201).json({ message });
});

// Both users see the ghost banner change straight away
function emitGhost(conversation) {
  emitToConversation(conversation._id, 'conversation:ghost', {
    conversationId: String(conversation._id),
    ghost: formatGhost(conversation.ghost),
  });
}

// POST /api/conversations/:id/ghost — ghost the other person.
// They get one normal message, then only emojis until I unghost them
// (enforced in POST /api/messages).
router.post('/:id/ghost', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;
  if (conversation.type === 'group') return badRequest(res, 'You can only ghost someone in a one-to-one chat.');

  if (conversation.ghost?.by) {
    const error =
      String(conversation.ghost.by) === req.userId
        ? "You're already ghosting them."
        : "You can't ghost someone who is ghosting you.";
    return res.status(409).json({ error });
  }

  // "ghost: null" also matches old conversations without the field
  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id, ghost: null },
    { ghost: { by: req.userId, stage: 'pending' } },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(409).json({ error: 'This chat just changed. Please try again.' });

  emitGhost(updated);
  res.json({ ghost: formatGhost(updated.ghost) });
});

// DELETE /api/conversations/:id/ghost — stop ghosting (only the one who ghosted can)
router.delete('/:id/ghost', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id, 'ghost.by': req.userId },
    { ghost: null },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(404).json({ error: "You aren't ghosting anyone in this chat." });

  emitGhost(updated);
  res.json({ ghost: null });
});

export default router;
