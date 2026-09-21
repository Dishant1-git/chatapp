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

export const MAX_GROUP_MEMBERS = 50;

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    // Direct chats: both user ids sorted and joined, e.g. "64a..._64b...".
    // A unique index on this makes duplicate conversations impossible,
    // even if two requests arrive at the same time.
    // Groups: "group:<random>", so they never clash with each other.
    key: { type: String, required: true, unique: true },
    // Groups only
    name: { type: String, trim: true, maxlength: 60, default: '' },
    image: { type: String, default: '' },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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

// Shapes a populated conversation for the browser. Direct chats also get
// "otherUser" (the person you're chatting with) for convenience.
export function formatConversation(conversation, userId, unreadCount = 0) {
  const conv = conversation.toObject ? conversation.toObject() : conversation;
  const participants = conv.participants || [];

  let lastMessage = conv.lastMessage || null;
  if (lastMessage) {
    const hiddenForMe = (lastMessage.deletedFor || []).some((id) => String(id) === String(userId));
    const { deletedFor, __v, ...rest } = lastMessage;
    lastMessage = hiddenForMe ? null : rest;
  }

  const result = {
    _id: conv._id,
    type: conv.type || 'direct',
    participants,
    lastMessage,
    lastMessageAt: conv.lastMessageAt,
    unreadCount,
    isMuted: (conv.mutedBy || []).some((id) => String(id) === String(userId)),
    ghost: formatGhost(conv.ghost),
  };

  if (result.type === 'group') {
    result.name = conv.name;
    result.image = conv.image;
    result.admins = (conv.admins || []).map(String);
    result.createdBy = conv.createdBy ? String(conv.createdBy) : null;
  } else {
    result.otherUser = participants.find((p) => String(p._id) !== String(userId)) || participants[0];
  }

  return result;
}

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
