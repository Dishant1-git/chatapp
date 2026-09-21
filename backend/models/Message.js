import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);

// The message's random content key, locked for one member of the chat
// (see frontend/lib/e2ee.js). keyId says which of their public keys was used.
const wrappedKeySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    keyId: { type: String, required: true },
    key: { type: String, required: true },
  },
  { _id: false }
);

// Group changes and calls, shown as small notes in the chat. They contain no
// message content, so they are stored as plain data.
const eventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['created', 'added', 'removed', 'left', 'renamed', 'photo', 'call'],
      required: true,
    },
    targets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    name: { type: String, default: '' },
    // Names of the people involved when it happened, so "Ann removed Bob"
    // still reads right after Bob is no longer in the group
    names: { type: Map, of: String, default: {} },
    // Calls
    video: { type: Boolean, default: false },
    duration: { type: Number, default: 0 }, // seconds; 0 = nobody answered
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Everyone in the chat except the sender, at the time it was sent.
    // Used for unread counts and delivered/read ticks.
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    messageType: { type: String, enum: ['text', 'image', 'event'], default: 'text' },

    // End-to-end encrypted content. The server can't read any of it.
    ciphertext: { type: String, default: '', maxlength: 40000 },
    iv: { type: String, default: '' },
    senderKey: { type: String, default: '' }, // sender's public key when it was sent
    keys: { type: [wrappedKeySchema], default: [] },
    // URL of the (encrypted) image file. The key to open it is inside the ciphertext.
    image: { type: String, default: '' },

    // Plain text of messages sent before encryption was added
    text: { type: String, default: '', maxlength: 4000 },

    event: { type: eventSchema, default: null },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: { type: [reactionSchema], default: [] },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // True once every recipient has it / has read it
    isDelivered: { type: Boolean, default: false },
    isRead: { type: Boolean, default: false },
    // "Delete for everyone" — the content is wiped and this flag is set
    isDeleted: { type: Boolean, default: false },
    // "Delete for me" — users in this list no longer see the message
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Loading a conversation page by page (newest first)
messageSchema.index({ conversationId: 1, _id: -1 });
// Counting unread messages / marking as delivered
messageSchema.index({ recipients: 1, isRead: 1 });

// Fields of the quoted message loaded with a reply
export const REPLY_FIELDS = 'text image messageType senderId isDeleted ciphertext iv senderKey keys';

// Recomputes isDelivered / isRead after deliveredTo / readBy changed.
// Written as an update pipeline so MongoDB does it in one step.
export const REFRESH_TICKS = [
  {
    $set: {
      isDelivered: { $setIsSubset: ['$recipients', { $ifNull: ['$deliveredTo', []] }] },
      isRead: { $setIsSubset: ['$recipients', { $ifNull: ['$readBy', []] }] },
    },
  },
];

messageSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v;
    delete ret.deletedFor;
    return ret;
  },
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
