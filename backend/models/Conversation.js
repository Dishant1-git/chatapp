import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    // Both user ids sorted and joined, e.g. "64a..._64b...".
    // A unique index on this makes duplicate conversations impossible,
    // even if two requests arrive at the same time.
    key: { type: String, required: true, unique: true },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: Date.now },
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
  };
}

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
