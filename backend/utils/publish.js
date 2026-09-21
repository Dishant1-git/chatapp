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

// Group changes and call logs, shown as small notes in the chat.
// Only calls count as unread (a missed call should stand out; "Ann added Bob" shouldn't).
export async function publishEvent(conversation, actorId, event) {
  const recipients =
    event.type === 'call' ? conversation.participants.filter((p) => String(p) !== String(actorId)) : [];

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
