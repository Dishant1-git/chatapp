import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, default: '', maxlength: 4000 },
    image: { type: String, default: '' },
    messageType: { type: String, enum: ['text', 'image'], default: 'text' },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: { type: [reactionSchema], default: [] },
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
// Counting unread messages / marking as read
messageSchema.index({ receiverId: 1, isRead: 1 });

messageSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v;
    delete ret.deletedFor;
    return ret;
  },
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
