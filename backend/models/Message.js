import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    // Anonymous reactions: others see that someone reacted, not which emoji,
    // unless they reveal it (limited per day)
    anonymous: { type: Boolean, default: false },
    revealedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
);

// A view-once Ghost Click can't be opened again by its sender or by anyone who
// already opened it, so the file link isn't handed out to them
export function maskGhostClick(message, viewerId) {
  const gc = message.ghostClick;
  if (!gc || gc.mode !== 'once') return message;
  const seen =
    String(message.senderId) === String(viewerId) || (gc.openedBy || []).some((id) => String(id) === String(viewerId));
  return seen ? { ...message, image: '', media: '' } : message;
}

// Hides the emoji of anonymous reactions from everyone except the reactor
// and people who revealed it. viewerId null = hide from everyone.
export function maskReactions(reactions = [], viewerId = null) {
  return reactions.map((r) => {
    const reaction = r.toObject ? r.toObject() : r;
    const { revealedTo = [], ...rest } = reaction;
    const canSee =
      !rest.anonymous ||
      (viewerId && (String(rest.userId) === String(viewerId) || revealedTo.some((id) => String(id) === String(viewerId))));
    return canSee ? rest : { ...rest, emoji: null };
  });
}

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
      enum: [
        'created',
        'added',
        'removed',
        'left',
        'renamed',
        'photo',
        'call',
        'missYou',
        'buzz', // 📳 vibrates the other person's phone
        'forgiven', // a forgiveness request was accepted
        'stillGhosted', // … or turned down
        'paused', // someone left a one-to-one chat ("exit without drama")
        'returned', // … and came back
        'revive', // "Should we revive this?" on a dead chat
      ],
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
    // "paused": why they stepped away
    reason: { type: String, default: '' },
    // "revive": the other person's answer ('' = not answered, 'yes', 'maybe', 'no')
    answer: { type: String, default: '' },
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
    messageType: { type: String, enum: ['text', 'image', 'audio', 'video', 'event'], default: 'text' },

    // End-to-end encrypted content. The server can't read any of it.
    ciphertext: { type: String, default: '', maxlength: 40000 },
    iv: { type: String, default: '' },
    senderKey: { type: String, default: '' }, // sender's public key when it was sent
    keys: { type: [wrappedKeySchema], default: [] },
    // URL of the (encrypted) image file. The key to open it is inside the ciphertext.
    image: { type: String, default: '' },
    // URL of the (encrypted) voice message or video note. Its duration, waveform
    // and file type are inside the ciphertext too; messageType says which kind it is.
    media: { type: String, default: '' },

    // Plain text of messages sent before encryption was added
    text: { type: String, default: '', maxlength: 4000 },

    event: { type: eventSchema, default: null },
    // A forgiveness request from someone who was ghosted. Its text is encrypted
    // like any message; only the status is plain.
    forgiveness: {
      type: new mongoose.Schema(
        { status: { type: String, enum: ['pending', 'forgiven', 'declined'], default: 'pending' } },
        { _id: false }
      ),
      default: null,
    },
    // "growth" = 🕊️ Character development (sender later forgave the other person)
    badge: { type: String, default: '' },
    // 👻 Ghost Click: a photo taken with the in-app camera. "once" photos can be
    // opened one time by each recipient; the file is deleted once everyone has.
    ghostClick: {
      type: new mongoose.Schema(
        {
          mode: { type: String, enum: ['once', 'keep'], required: true },
          openedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
          expired: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: null,
    },
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
export const REPLY_FIELDS = 'text image media messageType senderId isDeleted ciphertext iv senderKey keys';

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
