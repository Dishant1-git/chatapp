import { openMessage } from './e2ee';

export function isGroup(conversation) {
  return conversation?.type === 'group';
}

export function conversationTitle(conversation) {
  if (!conversation) return '';
  return isGroup(conversation) ? conversation.name : conversation.otherUser?.name || '';
}

export function findMember(conversation, userId) {
  return conversation?.participants?.find((p) => p._id === String(userId)) || null;
}

// Name lookup for message senders, reply quotes and group notes: "You" for me.
// fallback is used for people no longer in the chat.
export function makeNameOf(conversation, myId) {
  return (userId, fallback) => {
    if (String(userId) === myId) return 'You';
    return findMember(conversation, userId)?.name || fallback || 'Former member';
  };
}

// "Ann, Bob, You" — shown under a group's name
export function memberSummary(conversation, myId) {
  const others = (conversation?.participants || []).filter((p) => p._id !== myId).map((p) => p.name);
  return [...others, 'You'].join(', ');
}

// "typing…" in a direct chat; "Ann is typing…" / "Ann and Bob are typing…" in a group.
// typingUsers: { [userId]: true } or undefined. Returns '' when nobody is typing.
export function typingText(conversation, typingUsers) {
  const ids = Object.keys(typingUsers || {});
  if (!ids.length) return '';
  if (!isGroup(conversation)) return 'typing…';
  const names = ids.map((id) => findMember(conversation, id)?.name?.split(' ')[0] || 'Someone');
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}

export function isAdmin(conversation, userId) {
  return Boolean(conversation?.admins?.includes(String(userId)));
}

// Decrypts the preview of the last message
export async function openConversation(conversation) {
  if (!conversation.lastMessage) return conversation;
  return { ...conversation, lastMessage: await openMessage(conversation.lastMessage, conversation._id) };
}

function includesId(list, id) {
  return (list || []).some((x) => String(x) === String(id));
}

function allIn(recipients, list) {
  return (recipients || []).every((id) => includesId(list, id));
}

// Updates a message's ticks after `userId` received / read the chat.
// Returns the same object when nothing changed.
export function markDeliveredTo(message, userId) {
  if (!includesId(message.recipients, userId) || includesId(message.deliveredTo, userId)) return message;
  const deliveredTo = [...(message.deliveredTo || []), userId];
  return { ...message, deliveredTo, isDelivered: allIn(message.recipients, deliveredTo) };
}

// "Undo seen": the reader is taken back out of readBy
export function markUnreadBy(message, userId) {
  if (!includesId(message.readBy, userId)) return message;
  const readBy = message.readBy.filter((id) => String(id) !== String(userId));
  return { ...message, readBy, isRead: allIn(message.recipients, readBy) };
}

export function markReadBy(message, userId) {
  if (!includesId(message.recipients, userId) || includesId(message.readBy, userId)) return message;
  const readBy = [...(message.readBy || []), userId];
  const deliveredTo = includesId(message.deliveredTo, userId) ? message.deliveredTo : [...(message.deliveredTo || []), userId];
  return {
    ...message,
    readBy,
    deliveredTo,
    isRead: allIn(message.recipients, readBy),
    isDelivered: allIn(message.recipients, deliveredTo),
  };
}
