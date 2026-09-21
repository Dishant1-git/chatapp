import mongoose from 'mongoose';
import { formatGhost } from '../utils/ghost.js';

// One person ghosting the other — see utils/ghost.js for the stages
const ghostSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stage: { type: String, enum: ['pending', 'awaiting', 'emojiOnly'], required: true },
    // The one message the ghosted person sent
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    emojiUntil: { type: Date, default: null },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    // Both user ids sorted and joined, e.g. "64a..._64b...".
    // A unique index on this makes duplicate conversations impossible,
    // even if two requests arrive at the same time.
    key: { type: String, required: true, unique: true },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: Date.now },
    // Users who muted this chat (no notifications for them)
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    ghost: { type: ghostSchema, default: null },
  },
  { timestamps: true }
);

// Fast "my conversations, newest first" query
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export function conversationKey(userA, userB) {
  return [String(userA), String(userB)].sort().join('_');
}

// Shapes a populated conversation for the browser: instead of a participants
// array, the client gets "otherUser" (the person you're chatting with).
export function formatConversation(conversation, userId, unreadCount = 0) {
  const conv = conversation.toObject ? conversation.toObject() : conversation;
  const otherUser =
    conv.participants.find((p) => String(p._id) !== String(userId)) || conv.participants[0];

  let lastMessage = conv.lastMessage || null;
  if (lastMessage) {
    const hiddenForMe = (lastMessage.deletedFor || []).some((id) => String(id) === String(userId));
    const { deletedFor, __v, ...rest } = lastMessage;
    lastMessage = hiddenForMe ? null : rest;
  }

  return {
    _id: conv._id,
    otherUser,
    lastMessage,
    lastMessageAt: conv.lastMessageAt,
    unreadCount,
    isMuted: (conv.mutedBy || []).some((id) => String(id) === String(userId)),
    ghost: formatGhost(conv.ghost),
  };
}

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
