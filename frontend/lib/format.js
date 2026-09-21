// Date/time helpers for the UI

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

// Short preview of a message for the chat list and reply quotes
export function messagePreview(message) {
  if (!message) return '';
  if (message.isDeleted) return 'This message was deleted';
  if (message.messageType === 'image') return message.text ? `📷 ${message.text}` : '📷 Photo';
  return message.text;
}
