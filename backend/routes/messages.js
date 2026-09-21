import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimits.js';
import { UPLOAD_URL_PATTERN, ENCRYPTED_URL_PATTERN, deleteImage } from '../utils/storage.js';
import { REACTIONS } from '../utils/reactions.js';
<<<<<<< Updated upstream
import { formatGhost, ghostStage, isOnlyEmoji } from '../utils/ghost.js';
import { getIO, isUserOnline, conversationRoom, userRoom, emitToConversation } from '../socket/io.js';
=======
import { publishMessage } from '../utils/publish.js';
import { isUserOnline, emitToConversation } from '../socket/io.js';
>>>>>>> Stashed changes

const router = Router();
router.use(requireAuth);

const BASE64 = /^[A-Za-z0-9+/]+=*$/;

// Loads a message only if the logged-in user sent it or was one of its recipients
async function findMyMessage(req, res) {
  const { id } = req.params;
  const message = isValidObjectId(id)
    ? await Message.findOne({ _id: id, $or: [{ senderId: req.userId }, { recipients: req.userId }] })
    : null;
  if (!message) res.status(404).json({ error: 'Message not found.' });
  return message;
}

// POST /api/messages { conversationId, ciphertext, iv, senderKey, keys, image?, replyTo?, clientId? }
// The browser encrypts the message and locks its key once for every member
// (including the sender). The server only checks the shape and that nobody
// was left out, then stores and forwards it — it can't read the content.
router.post('/', messageLimiter, async (req, res) => {
  const body = req.body || {};
  const conversationId = String(body.conversationId || '');
  const ciphertext = String(body.ciphertext || '');
  const iv = String(body.iv || '');
  const senderKey = String(body.senderKey || '');
  const image = String(body.image || '');
  const replyTo = body.replyTo ? String(body.replyTo) : null;
  // Temporary id of the optimistic message in the sender's browser.
  // Echoed back so the sender can swap it for the saved message.
  const clientId = body.clientId ? String(body.clientId).slice(0, 60) : null;

  if (!isValidObjectId(conversationId)) return res.status(404).json({ error: 'Conversation not found.' });
  if (!ciphertext || ciphertext.length > 40000 || !BASE64.test(ciphertext)) {
    return res.status(400).json({ error: 'Message is empty or too long.' });
  }
  if (!BASE64.test(iv) || iv.length > 32) return res.status(400).json({ error: 'Invalid message.' });
  // Only accept encrypted files uploaded through /api/upload/encrypted
  if (image && !ENCRYPTED_URL_PATTERN.test(image)) return res.status(400).json({ error: 'Invalid image.' });

  // The sender must be a participant; everyone else in the chat receives it
  const conversation = await Conversation.findOne({ _id: conversationId, participants: req.userId });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  const members = await User.find({ _id: { $in: conversation.participants } }).select('name publicKey keyId');
  const me = members.find((m) => String(m._id) === req.userId);
  if (!me?.publicKey || senderKey !== me.publicKey) {
    return res.status(409).json({ error: 'Your encryption key changed. Please reload the page.', code: 'KEYS_CHANGED' });
  }

  const withoutKeys = members.filter((m) => !m.publicKey);
  if (withoutKeys.length) {
    const names = withoutKeys.map((m) => m.name).join(', ');
    return res.status(409).json({
      error: `${names} ${withoutKeys.length > 1 ? "haven't" : "hasn't"} set up encryption yet. They'll be able to receive messages after their next login.`,
      code: 'NO_KEYS',
    });
  }

  // Every member needs a copy of the message key, locked with their current public key
  const keys = Array.isArray(body.keys) ? body.keys : [];
  const keyFor = new Map(keys.map((k) => [String(k?.userId), k]));
  const complete =
    keys.length === members.length &&
    members.every((m) => {
      const entry = keyFor.get(String(m._id));
      return (
        entry &&
        entry.keyId === m.keyId &&
        typeof entry.key === 'string' &&
        entry.key.length <= 200 &&
        BASE64.test(entry.key)
      );
    });
  if (!complete) {
    return res.status(409).json({ error: 'The members of this chat changed. Please try again.', code: 'KEYS_CHANGED' });
  }

  if (replyTo) {
    const original = isValidObjectId(replyTo) && (await Message.exists({ _id: replyTo, conversationId }));
    if (!original) return res.status(404).json({ error: 'The message you are replying to no longer exists.' });
  }

<<<<<<< Updated upstream
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
=======
  const recipients = conversation.participants.filter((p) => String(p) !== req.userId);
>>>>>>> Stashed changes

  const message = await publishMessage(
    conversation,
    {
      senderId: req.userId,
      recipients,
      messageType: image ? 'image' : 'text',
      ciphertext,
      iv,
      senderKey,
      keys: members.map((m) => ({ userId: m._id, keyId: m.keyId, key: keyFor.get(String(m._id)).key })),
      image,
      replyTo,
      // Recipients with the app open get the message right away
      deliveredTo: recipients.filter((id) => isUserOnline(id)),
    },
    clientId
  );

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
// DELETE /api/messages/:id?for=everyone  — remove it for everyone (sender only)
router.delete('/:id', async (req, res) => {
  const message = await findMyMessage(req, res);
  if (!message) return;

  if (req.query.for !== 'everyone') {
    await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: req.userId } });
    return res.json({ success: true });
  }

  if (String(message.senderId) !== req.userId || message.messageType === 'event') {
    return res.status(403).json({ error: 'You can only delete your own messages for everyone.' });
  }

  const imageUrl = message.image;
  message.isDeleted = true;
  message.text = '';
  message.ciphertext = '';
  message.iv = '';
  message.keys = [];
  message.image = '';
  message.reactions = [];
  await message.save();

  // Remove the image file too — nobody can see it anymore
  if (imageUrl && (UPLOAD_URL_PATTERN.test(imageUrl) || ENCRYPTED_URL_PATTERN.test(imageUrl))) {
    deleteImage(imageUrl);
  }

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
  if (message.isDeleted || message.messageType === 'event') return res.status(404).json({ error: 'Message not found.' });

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
