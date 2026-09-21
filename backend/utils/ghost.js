// Ghosting rules. Keep in sync with frontend/lib/ghost.js
//
// When A ghosts B, the conversation's "ghost" has one of two stages:
//   pending   — B may send exactly one normal message
//   emojiOnly — B used it; from now on B can only send emojis
// It stays that way until A unghosts B, which removes the ghost.

// "awaiting" was used by an older version for the same thing as emojiOnly
export function ghostStage(ghost) {
  if (!ghost?.by) return null;
  return ghost.stage === 'pending' ? 'pending' : 'emojiOnly';
}

// Shapes a stored ghost for the browser
export function formatGhost(ghost) {
  if (!ghost?.by) return null;
  return {
    by: String(ghost.by),
    stage: ghostStage(ghost),
    messageId: ghost.messageId ? String(ghost.messageId) : null,
  };
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
