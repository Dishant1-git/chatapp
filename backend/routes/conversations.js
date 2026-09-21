import { Router } from 'express';
import mongoose, { isValidObjectId } from 'mongoose';
import Conversation, { conversationKey, formatConversation } from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { getIO, userRoom, conversationRoom, emitToConversation } from '../socket/io.js';

const router = Router();
router.use(requireAuth);

const PARTICIPANT_FIELDS = 'name email profileImage isOnline lastSeen';
const PAGE_SIZE = 30;

// Loads a conversation only if the logged-in user is part of it
async function findMyConversation(req, res) {
  const { id } = req.params;
  const conversation = isValidObjectId(id)
    ? await Conversation.findOne({ _id: id, participants: req.userId })
    : null;
  if (!conversation) res.status(404).json({ error: 'Conversation not found.' });
  return conversation;
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
    { $match: { receiverId: me, isRead: false, isDeleted: false, deletedFor: { $ne: me } } },
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

  if (!isValidObjectId(otherUserId)) return res.status(400).json({ error: 'Invalid user.' });
  if (otherUserId === req.userId) return res.status(400).json({ error: "You can't start a chat with yourself." });

  const otherUser = await User.exists({ _id: otherUserId });
  if (!otherUser) return res.status(404).json({ error: 'User not found.' });

  const key = conversationKey(req.userId, otherUserId);
  let conversation;
  try {
    // Upsert: returns the existing conversation or creates it atomically
    conversation = await Conversation.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, participants: [req.userId, otherUserId], lastMessageAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (err) {
    // Both users opened the chat at the exact same time — just load it
    if (err.code !== 11000) throw err;
    conversation = await Conversation.findOne({ key });
  }

  // Put both users' open connections into the conversation room
  const io = getIO();
  if (io) {
    const room = conversationRoom(conversation._id);
    io.in(userRoom(req.userId)).socketsJoin(room);
    io.in(userRoom(otherUserId)).socketsJoin(room);
  }

  await conversation.populate([
    { path: 'participants', select: PARTICIPANT_FIELDS },
    { path: 'lastMessage' },
  ]);

  res.json({ conversation: formatConversation(conversation, req.userId) });
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
    receiverId: req.userId,
    isRead: false,
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
    .populate('replyTo', 'text image messageType senderId isDeleted');

  const hasMore = messages.length > PAGE_SIZE;
  res.json({ messages: messages.slice(0, PAGE_SIZE).reverse(), hasMore });
});

// POST /api/conversations/:id/read — mark messages sent to me as read,
// then let the sender know (blue ticks)
router.post('/:id/read', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  const result = await Message.updateMany(
    { conversationId: conversation._id, receiverId: req.userId, isRead: false },
    { isRead: true, isDelivered: true }
  );

  if (result.modifiedCount > 0) {
    emitToConversation(conversation._id, 'messages:read', {
      conversationId: String(conversation._id),
      readerId: req.userId,
    });
  }

  res.json({ updated: result.modifiedCount });
});

export default router;
