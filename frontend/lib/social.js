// Labels for the playful features. Keep the keys in sync with the backend.

// Moods — backend/models/User.js
export const MOODS = {
  barely: { emoji: '🫠', label: 'barely functioning' },
  overthinking: { emoji: '🧠', label: 'overthinking' },
  dontText: { emoji: '💤', label: "don't text" },
  yap: { emoji: '🗣️', label: 'yap mode' },
  social: { emoji: '❤️', label: 'feeling social' },
  disappearing: { emoji: '👻', label: 'disappearing' },
};

// "Exit without drama" — backend/models/Conversation.js
export const PAUSE_REASONS = {
  space: { emoji: '🌱', label: 'Need space', note: 'is taking some space' },
  quiet: { emoji: '👻', label: 'Going quiet', note: 'is going quiet for a while' },
  break: { emoji: '🧘', label: 'Taking a break', note: 'is taking a break' },
  noContact: { emoji: '🚫', label: "Don't want contact", note: "doesn't want contact right now" },
};

// Answers to "Should we revive this?"
export const REVIVE_ANSWERS = {
  yes: { emoji: '❤️', label: 'Yes', result: '🔥 Chat revived!' },
  maybe: { emoji: '😂', label: 'Maybe', result: '😂 Maybe… we’ll see' },
  no: { emoji: '👻', label: 'Leave it dead', result: '👻 Left for dead' },
};

const DEAD_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// 🪦 A one-to-one chat with no activity for 30 days
export function isDeadChat(conversation, now = Date.now()) {
  if (!conversation || conversation.type === 'group' || !conversation.lastMessage) return false;
  return now - new Date(conversation.lastMessageAt).getTime() > DEAD_AFTER_MS;
}

// "4m", "35s", "2h"
export function formatShortDuration(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

// The browser's UTC offset as "+05:30", for day-based stats like the streak
export function timezoneOffset() {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
