import Message, { REPLY_FIELDS } from '../models/Message.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { getIO, conversationRoom, userRoom, isUserOnline } from '../socket/io.js';

// Saves a message, makes it the conversation's last message and pushes it to
// everyone in the chat. Messages are never broadcast before they're saved.
export async function publishMessage(conversation, fields, clientId = null) {
  const recipients = (fields.recipients || []).map(String);
  const deliveredTo = (fields.deliveredTo || []).map(String);
  const message = await Message.create({
    conversationId: conversation._id,
    ...fields,
    isDelivered: recipients.every((id) => deliveredTo.includes(id)),
    isRead: recipients.length === 0,
  });
  if (message.replyTo) await message.populate('replyTo', REPLY_FIELDS);

  // Send it out straight away. Two messages saved a moment apart used to be
  // announced in whatever order their *other* database work finished in, which
  // is how they could land in the wrong order on the other side. Everything
  // below this line is bookkeeping and can happen after the message is out.
  getIO()
    // Emitting to several rooms at once still sends each socket only one copy.
    // The user rooms cover sockets that haven't joined the conversation room yet.
    ?.to([conversationRoom(conversation._id), ...conversation.participants.map((p) => userRoom(p))])
    .emit('message:new', { message, clientId });

  // The chat list shows the newest message, so an older one that finishes
  // saving later must not take its place
  const isNewest = !conversation.lastMessageAt || message.createdAt >= conversation.lastMessageAt;
  if (isNewest) {
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
  }
  await conversation.save();
  // 🗑️ A chat someone deleted comes back to their list with the new message
  if (conversation.hiddenFor?.length) {
    await Conversation.updateOne({ _id: conversation._id }, { hiddenFor: [] });
  }

  return message;
}

// Tells everyone in the chat that part of a message changed (a forgiveness
// request was answered, a revive got a reply, a badge was added, ...)
export function emitMessageUpdate(conversationId, messageId, changes) {
  getIO()
    ?.to(conversationRoom(conversationId))
    .emit('message:updated', { conversationId: String(conversationId), messageId: String(messageId), changes });
}

// Uses one of today's allowances (e.g. 3 reaction reveals a day).
// Returns how many are left, or -1 if none were left.
export async function useDailyAllowance(userId, field, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const used = await User.findOneAndUpdate(
    { _id: userId, 'daily.day': day, [`daily.${field}`]: { $lt: limit } },
    { $inc: { [`daily.${field}`]: 1 } },
    { returnDocument: 'after' }
  ).select('+daily');
  if (used) return limit - used.daily[field];

  // First use today: start a fresh day (only if the stored day is an old one)
  const fresh = await User.findOneAndUpdate(
    { _id: userId, 'daily.day': { $ne: day } },
    { daily: { day, reveals: 0, undoSeen: 0, [field]: 1 } },
    { returnDocument: 'after' }
  );
  return fresh ? limit - 1 : -1;
}

// Private counters for the "ghost score" dashboard
export function bumpStat(userId, stat) {
  return User.updateOne({ _id: userId }, { $inc: { [`stats.${stat}`]: 1 } });
}

// Events that should stand out like a message: unread badge and a notification.
// Group changes ("Ann added Bob") don't.
const UNREAD_EVENTS = ['call', 'missYou', 'buzz', 'forgiven', 'stillGhosted', 'paused', 'returned', 'revive', 'nickname'];

// Group changes, call logs and "miss you" nudges, shown as small notes in the chat.
export async function publishEvent(conversation, actorId, event) {
  const recipients = UNREAD_EVENTS.includes(event.type)
    ? conversation.participants.filter((p) => String(p) !== String(actorId))
    : [];

  const people = await User.find({ _id: { $in: [actorId, ...(event.targets || [])] } }).select('name');
  const names = Object.fromEntries(people.map((p) => [String(p._id), p.name]));

  return publishMessage(conversation, {
    senderId: actorId,
    recipients,
    messageType: 'event',
    event: { ...event, names },
    deliveredTo: recipients.filter((id) => isUserOnline(id)),
  });
}
