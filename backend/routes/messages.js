import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message, { maskReactions } from '../models/Message.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimits.js';
import { UPLOAD_URL_PATTERN, ENCRYPTED_URL_PATTERN, deleteImage } from '../utils/storage.js';
import { REACTIONS } from '../utils/reactions.js';
import { FORGIVE_COOLDOWN_MS, formatGhost, ghostLevel, isOnlyEmoji } from '../utils/ghost.js';
import { bumpStat, publishMessage, useDailyAllowance } from '../utils/publish.js';
import { resumeConversation } from './conversations.js';
import { getIO, isUserOnline, emitToConversation, conversationRoom, userRoom } from '../socket/io.js';

const REVEALS_PER_DAY = 3;

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
//
// One exception: someone ghosted at the "ghosted" or "deep" level (emojis only) sends
// { conversationId, text } unencrypted, so the server can check it really
// is only emojis (it can't look inside an encrypted message).
router.post('/', messageLimiter, async (req, res) => {
  const body = req.body || {};
  const conversationId = String(body.conversationId || '');
  const ciphertext = String(body.ciphertext || '');
  const iv = String(body.iv || '');
  const senderKey = String(body.senderKey || '');
  const text = String(body.text || '').trim();
  const image = String(body.image || '');
  const replyTo = body.replyTo ? String(body.replyTo) : null;
  // Temporary id of the optimistic message in the sender's browser.
  // Echoed back so the sender can swap it for the saved message.
  const clientId = body.clientId ? String(body.clientId).slice(0, 60) : null;

  if (!isValidObjectId(conversationId)) return res.status(404).json({ error: 'Conversation not found.' });
  // Only accept encrypted files uploaded through /api/upload/encrypted
  if (image && !ENCRYPTED_URL_PATTERN.test(image)) return res.status(400).json({ error: 'Invalid image.' });

  // The sender must be a participant; everyone else in the chat receives it
  const conversation = await Conversation.findOne({ _id: conversationId, participants: req.userId });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  const recipients = conversation.participants.filter((p) => String(p) !== req.userId);

  if (replyTo) {
    const original = isValidObjectId(replyTo) && (await Message.exists({ _id: replyTo, conversationId }));
    if (!original) return res.status(404).json({ error: 'The message you are replying to no longer exists.' });
  }

  const receiverId = conversation.type === 'group' ? null : recipients[0];

  // They stepped away from the chat ("exit without drama"). If I'm the one
  // who stepped away, writing again means I'm back.
  if (conversation.pausedBy?.by) {
    if (String(conversation.pausedBy.by) !== req.userId) {
      return res.status(403).json({ error: "They're taking some space. You can't message them right now." });
    }
    await resumeConversation(conversation, req.userId);
  }

  // Ghosted by the other person (see utils/ghost.js for what each level allows)
  const ghostedByReceiver = receiverId && String(conversation.ghost?.by) === String(receiverId);
  const level = ghostedByReceiver ? ghostLevel(conversation.ghost) : null;
  const isForgivenessRequest = body.forgive === true;

  if (isForgivenessRequest) {
    if (!level) return res.status(400).json({ error: "You're not being ghosted here." });
    if (level === 'permanent') return res.status(403).json({ error: 'This chat is locked. You can’t ask for forgiveness.' });
    if (level === 'deep') return res.status(403).json({ error: "In deep ghost mode it's emojis and reactions only." });
    if (image) return res.status(400).json({ error: 'A forgiveness request is text only.' });
  } else if (level === 'permanent') {
    return res.status(403).json({ error: "You've been permanently ghosted. This chat is locked." });
  } else if (level === 'ghosted' || level === 'deep') {
    // Emojis only — sent unencrypted so the server can check it really is only emojis
    if (image || ciphertext || !text || text.length > 200 || !isOnlyEmoji(text)) {
      const error =
        level === 'deep'
          ? "You're in deep ghost mode. Only emojis and reactions."
          : "You've been ghosted. You can send emojis, and one forgiveness request.";
      return res.status(403).json({ error });
    }
    const message = await publishMessage(
      conversation,
      {
        senderId: req.userId,
        recipients,
        messageType: 'text',
        text,
        replyTo,
        deliveredTo: recipients.filter((id) => isUserOnline(id)),
      },
      clientId
    );
    return res.status(201).json({ message });
  }

  if (!ciphertext || ciphertext.length > 40000 || !BASE64.test(ciphertext)) {
    return res.status(400).json({ error: 'Message is empty or too long.' });
  }
  if (!BASE64.test(iv) || iv.length > 32) return res.status(400).json({ error: 'Invalid message.' });

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

  if (isForgivenessRequest) {
    // One request at a time, and 24 hours between requests. Claimed atomically
    // so two quick sends can't both get through.
    const claimed = await Conversation.updateOne(
      {
        _id: conversationId,
        'ghost.by': receiverId,
        'ghost.requestId': null,
        $or: [{ 'ghost.lastRequestAt': null }, { 'ghost.lastRequestAt': { $lt: new Date(Date.now() - FORGIVE_COOLDOWN_MS) } }],
      },
      { 'ghost.lastRequestAt': new Date() }
    );
    if (!claimed.modifiedCount) {
      const error = conversation.ghost.requestId
        ? 'Your request is still waiting for an answer.'
        : 'You can ask for forgiveness again 24 hours after your last request.';
      return res.status(429).json({ error });
    }
  }

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
      forgiveness: isForgivenessRequest ? { status: 'pending' } : null,
      // Recipients with the app open get the message right away
      deliveredTo: recipients.filter((id) => isUserOnline(id)),
    },
    clientId
  );

  if (isForgivenessRequest) {
    // The ghoster now sees Forgive / Keep ghosting / Ask me later on this message
    await bumpStat(req.userId, 'apologies');
    const updated = await Conversation.findOneAndUpdate(
      { _id: conversationId, 'ghost.by': receiverId },
      { 'ghost.requestId': message._id },
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

// Pushes new reactions to everyone: anonymous emojis are hidden from others,
// and the reactor's own devices get the real list
function emitReactions(message, reactorId) {
  const io = getIO();
  const payload = (reactions) => ({
    messageId: String(message._id),
    conversationId: String(message.conversationId),
    reactions,
  });
  io?.to(conversationRoom(message.conversationId))
    .except(userRoom(reactorId))
    .emit('message:reaction', payload(maskReactions(message.reactions, null)));
  io?.to(userRoom(reactorId)).emit('message:reaction', payload(maskReactions(message.reactions, reactorId)));
}

// POST /api/messages/:id/reaction { emoji, anonymous? }
// Each user has at most one reaction per message (like WhatsApp):
// same emoji again → removed, different emoji → replaced.
// Anonymous: others see that someone reacted, but not which emoji.
router.post('/:id/reaction', async (req, res) => {
  const emoji = String(req.body?.emoji || '');
  const anonymous = req.body?.anonymous === true;
  if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: 'This reaction is not supported.' });

  const message = await findMyMessage(req, res);
  if (!message) return;
  if (message.isDeleted || message.messageType === 'event') return res.status(404).json({ error: 'Message not found.' });

  // Permanently ghosted or paused chats: no reactions either (emoji reactions are fine otherwise)
  const conversation = await Conversation.findById(message.conversationId).select('ghost pausedBy');
  const ghostedByOther = conversation?.ghost?.by && String(conversation.ghost.by) !== req.userId;
  if (ghostedByOther && ghostLevel(conversation.ghost) === 'permanent') {
    return res.status(403).json({ error: "You've been ghosted. You can't react here." });
  }
  if (conversation?.pausedBy?.by && String(conversation.pausedBy.by) !== req.userId) {
    return res.status(403).json({ error: "They're taking some space right now." });
  }

  const existing = message.reactions.find((r) => String(r.userId) === req.userId);
  const same = existing?.emoji === emoji && Boolean(existing?.anonymous) === anonymous;

  message.reactions = message.reactions.filter((r) => String(r.userId) !== req.userId);
  if (!same) message.reactions.push({ userId: req.userId, emoji, anonymous });
  await message.save();

  emitReactions(message, req.userId);
  res.json({ reactions: maskReactions(message.reactions, req.userId) });
});

// POST /api/messages/:id/reveal — see which emoji the anonymous reactions are (3 a day)
router.post('/:id/reveal', async (req, res) => {
  const message = await findMyMessage(req, res);
  if (!message) return;

  const hidden = message.reactions.filter(
    (r) => r.anonymous && String(r.userId) !== req.userId && !r.revealedTo.some((id) => String(id) === req.userId)
  );
  if (!hidden.length) return res.status(400).json({ error: 'Nothing to reveal.' });

  const remaining = await useDailyAllowance(req.userId, 'reveals', REVEALS_PER_DAY);
  if (remaining < 0) return res.status(429).json({ error: `You can reveal ${REVEALS_PER_DAY} reactions a day. Try tomorrow 👀` });

  hidden.forEach((r) => r.revealedTo.push(req.userId));
  await message.save();
  res.json({ reactions: maskReactions(message.reactions, req.userId), remaining });
});

export default router;
