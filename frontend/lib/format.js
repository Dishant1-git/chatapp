// Date/time helpers for the UI
import { PAUSE_REASONS, REVIVE_ANSWERS } from './social';

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function isYesterday(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

// "10:32 AM"
export function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Chat list: "10:32 AM", "Yesterday", "Mon", "12/03/2026"
export function formatListDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();

  if (isSameDay(date, now)) return formatTime(date);
  if (isYesterday(date)) return 'Yesterday';

  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(now.getDate() - 6);
  if (date > sixDaysAgo) return date.toLocaleDateString([], { weekday: 'short' });

  return date.toLocaleDateString();
}

// Divider between days in a chat: "Today", "Yesterday", "Monday, 12 March 2026"
export function formatDayDivider(value) {
  const date = new Date(value);
  if (isSameDay(date, new Date())) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function isDifferentDay(a, b) {
  return !isSameDay(new Date(a), new Date(b));
}

// "last seen today at 10:30 AM"
export function formatLastSeen(value) {
  if (!value) return 'offline';
  const date = new Date(value);
  if (isSameDay(date, new Date())) return `last seen today at ${formatTime(date)}`;
  if (isYesterday(date)) return `last seen yesterday at ${formatTime(date)}`;
  return `last seen ${date.toLocaleDateString()} at ${formatTime(date)}`;
}

// Call length: "0:42", "12:05", "1:02:03"
export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || 'someone';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Text for group changes and calls. nameOf(userId) should return "You" for me.
export function describeEvent(message, nameOf, myId) {
  const event = message.event || {};
  // Names saved with the note cover people who have since left the group
  const name = (id) => nameOf(id, event.names?.[String(id)]);
  const actor = name(message.senderId);
  const targets = joinNames((event.targets || []).map(name));

  switch (event.type) {
    case 'created':
      return `${actor} created the group “${event.name}”`;
    case 'added':
      return `${actor} added ${targets}`;
    case 'removed':
      return `${actor} removed ${targets}`;
    case 'left':
      return `${actor} left`;
    case 'renamed':
      return `${actor} changed the group name to “${event.name}”`;
    case 'photo':
      return `${actor} changed the group photo`;
    case 'missYou':
      return String(message.senderId) === myId ? 'You said you miss them 💕' : `${actor} is missing you 💕`;
    case 'forgiven':
      return String(message.senderId) === myId ? '🕊️ You unghosted them' : `✨ ${actor} forgave you. You're unghosted.`;
    case 'stillGhosted':
      return String(message.senderId) === myId ? '👻 You kept ghosting them' : '👻 Still ghosted';
    case 'paused': {
      const reason = PAUSE_REASONS[event.reason] || PAUSE_REASONS.space;
      return String(message.senderId) === myId
        ? `${reason.emoji} You stepped away (${reason.label.toLowerCase()})`
        : `${reason.emoji} ${actor} ${reason.note}`;
    }
    case 'returned':
      return String(message.senderId) === myId ? "👋 You're back" : `👋 ${actor} is back`;
    case 'revive':
      if (event.answer) return REVIVE_ANSWERS[event.answer]?.result || '';
      return String(message.senderId) === myId ? '🧟 You asked to revive this chat' : `🧟 ${actor}: Should we revive this?`;
    case 'call': {
      const kind = event.video ? 'video call' : 'voice call';
      if (event.duration) return `${event.video ? 'Video' : 'Voice'} call · ${formatDuration(event.duration)}`;
      return String(message.senderId) === myId ? `${kind[0].toUpperCase()}${kind.slice(1)} · No answer` : `Missed ${kind}`;
    }
    default:
      return '';
  }
}

// Short preview of a message for the chat list, notifications and reply quotes
export function messagePreview(message, { nameOf = () => 'Someone', myId = null } = {}) {
  if (!message) return '';
  if (message.isDeleted) return 'This message was deleted';
  if (message.messageType === 'event') return describeEvent(message, nameOf, myId);
  if (message.forgiveness) return '🕊️ Forgiveness request';
  if (message.ghostClick) return '👻 Ghost Click';
  if (message.undecryptable) return "🔒 This message can't be decrypted";
  if (message.messageType === 'image') return message.text ? `📷 ${message.text}` : '📷 Photo';
  return message.text;
}
