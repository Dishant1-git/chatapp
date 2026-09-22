// Ghosting rules. Keep in sync with backend/utils/ghost.js
//
// When A ghosts B (one-to-one chats only), A picks a level:
//   soft      — B can message normally; A just doesn't get notified
//   ghosted   — B can send emojis, plus one forgiveness request (their one chance)
//   deep      — B can only send emojis and reactions (no forgiveness request)
//   permanent — the chat is locked for B: nothing, not even a request
// A can change the level or unghost B at any time. Forgiving B's request unghosts them.
// B can send one request at a time, and must wait 24 hours before asking again.

export const GHOST_LEVELS = ['soft', 'ghosted', 'deep', 'permanent'];
export const FORGIVE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Chats ghosted by older versions stored a "stage" instead of a level
export function ghostLevel(ghost) {
  if (!ghost?.by) return null;
  if (GHOST_LEVELS.includes(ghost.level)) return ghost.level;
  return ghost.stage === 'pending' ? 'ghosted' : 'deep';
}

export const GHOST_LEVEL_INFO = {
  soft: { emoji: '🌫️', label: 'Soft ghost', hint: 'They can still message you. You just won’t be notified.' },
  ghosted: { emoji: '👻', label: 'Ghosted', hint: 'Emojis only, plus one forgiveness request.' },
  deep: { emoji: '🕳️', label: 'Deep ghost', hint: 'Emojis and reactions only. No forgiveness request.' },
  permanent: { emoji: '🔒', label: 'Permanent ghost', hint: 'The chat is locked for them.' },
};

// When they may ask for forgiveness again (null = now)
export function nextRequestAt(ghost, now = Date.now()) {
  if (!ghost?.lastRequestAt) return null;
  const at = new Date(ghost.lastRequestAt).getTime() + FORGIVE_COOLDOWN_MS;
  return at > now ? at : null;
}

// Keycaps (1️⃣, #️⃣) are the only emojis that start with a normal character
const KEYCAP = /[#*0-9]️?⃣/gu;
const HAS_EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const ONLY_EMOJI_PARTS = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}‍️\u{E0020}-\u{E007F}\s]+$/u;

// "😂🔥" → true, "ok 😂" → false
export function isOnlyEmoji(text) {
  const withoutKeycaps = String(text).replace(KEYCAP, '⭐');
  return HAS_EMOJI.test(withoutKeycaps) && ONLY_EMOJI_PARTS.test(withoutKeycaps);
}
