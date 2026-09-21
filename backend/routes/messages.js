import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimits.js';
import { UPLOAD_URL_PATTERN, deleteImage } from '../utils/storage.js';
import { REACTIONS } from '../utils/reactions.js';
import { formatGhost, ghostStage, isOnlyEmoji } from '../utils/ghost.js';
import { getIO, isUserOnline, conversationRoom, userRoom, emitToConversation } from '../socket/io.js';

const router = Router();
router.use(requireAuth);

// Loads a message only if the logged-in user sent or received it
async function findMyMessage(req, res) {
  const { id } = req.params;
  const message = isValidObjectId(id)
    ? await Message.findOne({ _id: id, $or: [{ senderId: req.userId }, { receiverId: req.userId }] })
    : null;
  if (!message) res.status(404).json({ error: 'Message not found.' });
  return message;
}

// POST /api/messages { conversationId, text?, image?, replyTo?, clientId? }
// Saves the message first, then pushes it to both users over Socket.IO.
router.post('/', messageLimiter, async (req, res) => {
  const body = req.body || {};
  const conversationId = String(body.conversationId || '');
  const text = String(body.text || '').trim();
  const image = String(body.image || '');
  const replyTo = body.replyTo ? String(body.replyTo) : null;
  // Temporary id of the optimistic message in the sender's browser.
  // Echoed back so the sender can swap it for the saved message.
  const clientId = body.clientId ? String(body.clientId).slice(0, 60) : null;

  if (!isValidObjectId(conversationId)) return res.status(404).json({ error: 'Conversation not found.' });
  if (!text && !image) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > 4000) return res.status(400).json({ error: 'Message is too long (max 4000 characters).' });
  // Only accept images uploaded through /api/upload
  if (image && !UPLOAD_URL_PATTERN.test(image)) return res.status(400).json({ error: 'Invalid image.' });

  // The sender must be a participant; the receiver is the other participant
  const conversation = await Conversation.findOne({ _id: conversationId, participants: req.userId });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  const receiverId = conversation.participants.find((p) => String(p) !== req.userId);

  if (replyTo) {
    const original = isValidObjectId(replyTo) && (await Message.exists({ _id: replyTo, conversationId }));
    if (!original) return res.status(404).json({ error: 'The message you are replying to no longer exists.' });
  }

  // Ghosted by the receiver: one message to change their mind, then emojis only, then nothing
  const ghostedByReceiver = String(conversation.ghost?.by) === String(receiverId);
  const stage = ghostedByReceiver ? ghostStage(conversation.ghost) : null;
  const USED_CHANCE = "You've sent your one message. Wait for them to decide.";

  if (stage === 'awaiting') return res.status(403).json({ error: USED_CHANCE });
  if (stage === 'full') return res.status(403).json({ error: "You've been ghosted. You can't send messages here." });
  if (stage === 'emojiOnly' && (image || !isOnlyEmoji(text))) {
    return res.status(403).json({ error: "You've been ghosted. You can only send emojis." });
  }
  if (stage === 'pending') {
    // Claim the one message atomically so two quick sends can't both get through
    const claimed = await Conversation.updateOne(
      { _id: conversationId, 'ghost.by': receiverId, 'ghost.stage': 'pending' },
      { 'ghost.stage': 'awaiting' }
    );
    if (!claimed.modifiedCount) return res.status(403).json({ error: USED_CHANCE });
  }

  const message = await Message.create({
    conversationId,
    senderId: req.userId,
    receiverId,
    text,
    image,
    messageType: image ? 'image' : 'text',
    replyTo,
    // If the receiver has the app open, the message reaches them right away
    isDelivered: isUserOnline(receiverId),
  });

  await message.populate('replyTo', 'text image messageType senderId isDeleted');

  conversation.lastMessage = message._id;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  // Emitting to several rooms at once still sends each socket only one copy.
  // The user rooms cover sockets that haven't joined the conversation room yet.
  getIO()
    ?.to([conversationRoom(conversationId), userRoom(req.userId), userRoom(receiverId)])
    .emit('message:new', { message, clientId });

  if (stage === 'pending') {
    // Remember which message was the one chance, and show the ghoster the verdict buttons
    const updated = await Conversation.findOneAndUpdate(
      { _id: conversationId, 'ghost.by': receiverId, 'ghost.stage': 'awaiting' },
      { 'ghost.messageId': message._id },
      { returnDocument: 'after' }
    );
    if (updated) {
      emitToConversation(conversationId, 'conversation:ghost', {
        conversationId,
        ghost: formatGhost(updated.ghost),
      });
    }
  }

  res.status(201).json({ message });
});

// DELETE /api/messages/:id?for=me        — hide it only for me
// DELETE /api/messages/:id?for=everyone  — remove it for both (sender only)
router.delete('/:id', async (req, res) => {
  const message = await findMyMessage(req, res);
  if (!message) return;

  if (req.query.for !== 'everyone') {
    await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: req.userId } });
    return res.json({ success: true });
  }

  if (String(message.senderId) !== req.userId) {
    return res.status(403).json({ error: 'You can only delete your own messages for everyone.' });
  }

  const imageUrl = message.image;
  message.isDeleted = true;
  message.text = '';
  message.image = '';
  message.reactions = [];
  await message.save();

  // Remove the image file too — nobody can see it anymore
  if (imageUrl) deleteImage(imageUrl);

  emitToConversation(message.conversationId, 'message:deleted', {
    messageId: String(message._id),
    conversationId: String(message.conversationId),
  });

  res.json({ success: true });
});

// POST /api/messages/:id/reaction { emoji }
// Each user has at most one reaction per message (like WhatsApp):
// same emoji again → removed, different emoji → replaced.
router.post('/:id/reaction', async (req, res) => {
  const emoji = String(req.body?.emoji || '');
  if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: 'This reaction is not supported.' });

  const message = await findMyMessage(req, res);
  if (!message) return;
  if (message.isDeleted) return res.status(404).json({ error: 'Message not found.' });

  // Fully ghosted people can't react either
  const conversation = await Conversation.findById(message.conversationId).select('ghost');
  const ghostedByOther = conversation?.ghost?.by && String(conversation.ghost.by) !== req.userId;
  if (ghostedByOther && ghostStage(conversation.ghost) === 'full') {
    return res.status(403).json({ error: "You've been ghosted. You can't react here." });
  }

  const existing = message.reactions.find((r) => String(r.userId) === req.userId);
  const sameEmoji = existing?.emoji === emoji;

  message.reactions = message.reactions.filter((r) => String(r.userId) !== req.userId);
  if (!sameEmoji) message.reactions.push({ userId: req.userId, emoji });
  await message.save();

  emitToConversation(message.conversationId, 'message:reaction', {
    messageId: String(message._id),
    conversationId: String(message.conversationId),
    reactions: message.reactions,
  });

  res.json({ reactions: message.reactions });
});

export default router;
