// ⏳ Disappearing messages: a message goes a while after it has been seen (in a
// group, after everyone has seen it). Keep the seconds in sync with
// DISAPPEAR_OPTIONS in backend/utils/disappearing.js — the server refuses anything else.
const HOUR = 60 * 60;
// "Instantly" is a few seconds, so the person who opens it has time to read it
const INSTANT = 10;

export const DISAPPEAR_OPTIONS = [
  { seconds: 0, emoji: '♾️', label: 'Off', hint: 'Messages stay until someone deletes them' },
  { seconds: INSTANT, emoji: '⚡', label: 'Instantly', hint: 'Gone 10 seconds after it’s seen' },
  { seconds: HOUR, emoji: '⏱️', label: '1 hour', hint: 'Gone an hour after it’s seen' },
  { seconds: 2 * HOUR, emoji: '☕', label: '2 hours', hint: 'Time to read it twice' },
  { seconds: 4 * HOUR, emoji: '🌤️', label: '4 hours', hint: 'Lasts the afternoon' },
  { seconds: 8 * HOUR, emoji: '💼', label: '8 hours', hint: 'Lasts the working day' },
  { seconds: 24 * HOUR, emoji: '🌙', label: '24 hours', hint: 'Gone by this time tomorrow' },
];

// "24 hours", or '' when it's off
export function disappearLabel(seconds) {
  if (!seconds) return '';
  return DISAPPEAR_OPTIONS.find((o) => o.seconds === seconds)?.label || `${Math.round(seconds / HOUR)} hours`;
}

// "1 hour after they're seen" / "right after they're seen", or '' when it's off
export function disappearWhen(seconds) {
  if (!seconds) return '';
  return seconds === INSTANT ? 'right after they’re seen' : `${disappearLabel(seconds)} after they’re seen`;
}

// The server wipes a message within a few seconds of its time being up; the
// browser stops showing it the moment it is
export function isGone(message, now = Date.now()) {
  if (!message) return false;
  return Boolean(message.disappeared) || (Boolean(message.expiresAt) && new Date(message.expiresAt).getTime() <= now);
}
