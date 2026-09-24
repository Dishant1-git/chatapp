import mongoose from 'mongoose';

// ⏰ A message written now and sent later, to one or more people at once.
// It's end-to-end encrypted like any message: the browser encrypts one copy per
// chat when it's scheduled, and the server only stores and later publishes them.
// The sender can read their own copies back (every copy is also locked for them).

export const MAX_SCHEDULED_RECIPIENTS = 20;
export const MAX_PENDING_SCHEDULED = 50; // per user
export const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000; // a year

const wrappedKeySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    keyId: { type: String, required: true },
    key: { type: String, required: true },
  },
  { _id: false }
);

// One copy of the message, for one chat
const itemSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    // Who it's for (the other person in that one-to-one chat), to show in the list
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ciphertext: { type: String, required: true, maxlength: 40000 },
    iv: { type: String, required: true },
    senderKey: { type: String, required: true },
    keys: { type: [wrappedKeySchema], default: [] },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    error: { type: String, default: '' }, // why it couldn't be sent
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  { _id: false }
);

const scheduledMessageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sendAt: { type: Date, required: true },
    // pending → sending (being published right now) → done; or cancelled by the sender
    status: { type: String, enum: ['pending', 'sending', 'done', 'cancelled'], default: 'pending' },
    items: { type: [itemSchema], default: [] },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The scheduler's "what's due?" query, and each user's own list
scheduledMessageSchema.index({ status: 1, sendAt: 1 });
scheduledMessageSchema.index({ senderId: 1, sendAt: -1 });

const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema);

export default ScheduledMessage;
