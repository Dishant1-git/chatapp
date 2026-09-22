import Message, { REPLY_FIELDS } from '../models/Message.js';
import User from '../models/User.js';
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

  conversation.lastMessage = message._id;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  // Emitting to several rooms at once still sends each socket only one copy.
  // The user rooms cover sockets that haven't joined the conversation room yet.
  getIO()
    ?.to([conversationRoom(conversation._id), ...conversation.participants.map((p) => userRoom(p))])
    .emit('message:new', { message, clientId });

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
const UNREAD_EVENTS = ['call', 'missYou', 'buzz','forgiven', 'stillGhosted', 'paused', 'returned', 'revive'];

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
