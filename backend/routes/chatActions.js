// Chat options: unblock (for chats blocked before blocking was removed), 🧹 clear chat,
// 🗑️ delete chat and 💖 nicknames.
import { Router } from 'express';
import Conversation, { formatNicknames } from '../models/Conversation.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { groupLimiter } from '../middleware/rateLimits.js';
import { badRequest, findMyConversation } from './conversations.js';
import { publishEvent } from '../utils/publish.js';
import { getIO, emitToConversation, userRoom } from '../socket/io.js';

const router = Router();
router.use(requireAuth);

const MAX_NICKNAME = 30;

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

// Only my own tabs and devices need to know (the other person isn't told they're blocked)
function emitToMe(userId, event, data) {
  getIO()?.to(userRoom(userId)).emit(event, data);
}

// ---- 🚫 Unblock ----

// DELETE /api/conversations/:id/block — unblock. Blocking itself was removed from
// the app; this lets chats that were blocked before that be opened up again.
router.delete('/:id/block', async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;

  await Conversation.updateOne({ _id: conversation._id }, { $pull: { blockedBy: req.userId } });
  emitToMe(req.userId, 'conversation:updated', { conversation: { _id: String(conversation._id), blockedByMe: false } });
  res.json({ blockedByMe: false });
});

// ---- 🧹 Clear and 🗑️ delete ----

// Hides every message in the chat for me only (like "delete for me" on all of them)
function clearFor(conversationId, userId) {
  return Message.updateMany(
    { conversationId, deletedFor: { $ne: userId } },
    { $addToSet: { deletedFor: userId } }
  );
}

// POST /api/conversations/:id/clear — empty the chat for me. The others keep their messages.
router.post('/:id/clear', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  await clearFor(conversation._id, req.userId);
  emitToMe(req.userId, 'conversation:cleared', { conversationId: String(conversation._id) });
  res.json({ success: true });
});

// DELETE /api/conversations/:id — clear the chat and remove it from my list.
// It comes back if someone sends a new message.
router.delete('/:id', async (req, res) => {
  const conversation = await findMyConversation(req, res);
  if (!conversation) return;

  await clearFor(conversation._id, req.userId);
  await Conversation.updateOne({ _id: conversation._id }, { $addToSet: { hiddenFor: req.userId } });
  emitToMe(req.userId, 'conversation:removed', { conversationId: String(conversation._id) });
  res.json({ success: true });
});

// ---- 💖 Nicknames ----

// PUT /api/conversations/:id/nickname { nickname } — give the other person a nickname
// ('' removes it). Both people see it, and they get a cute note about it.
router.put('/:id/nickname', groupLimiter, async (req, res) => {
  const conversation = await findMyDirectChat(req, res);
  if (!conversation) return;
  if ((conversation.blockedBy || []).length) return res.status(403).json({ error: "You can't do that in this chat." });

  const nickname = String(req.body?.nickname ?? '').trim().replace(/\s+/g, ' ');
  if (nickname.length > MAX_NICKNAME) return badRequest(res, `A nickname can be up to ${MAX_NICKNAME} characters.`);

  const targetId = String(conversation.participants.find((p) => String(p) !== req.userId));
  const current = conversation.nicknames?.get(targetId) || '';
  if (nickname === current) return res.json({ nicknames: formatNicknames(conversation.nicknames) });

  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id },
    nickname ? { $set: { [`nicknames.${targetId}`]: nickname } } : { $unset: { [`nicknames.${targetId}`]: '' } },
    { returnDocument: 'after' }
  );
  const nicknames = formatNicknames(updated.nicknames);

  emitToConversation(conversation._id, 'conversation:updated', { conversation: { _id: String(conversation._id), nicknames } });
  // "Nidhi named you “cutie” 💖" — they also get a little celebration when they see it
  await publishEvent(updated, req.userId, { type: 'nickname', targets: [targetId], name: nickname });
  res.json({ nicknames });
});

export default router;
