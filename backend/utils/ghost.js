// Ghosting rules. Keep in sync with frontend/lib/ghost.js
//
// When A ghosts B, the conversation's "ghost" moves through these stages:
//   pending   — B may send exactly one message to change A's mind
//   awaiting  — B used it; B can't send anything until A decides
//   emojiOnly — A chose to ghost B; B can only send emojis for 15 minutes
//   full      — the 15 minutes are over; B can't send anything
// If A forgives B (or unghosts them) the ghost is removed.

export const GHOST_EMOJI_MS = 15 * 60 * 1000;

// "full" isn't stored — it's worked out from emojiUntil, so no timer job is needed
export function ghostStage(ghost, now = Date.now()) {
  if (!ghost?.by) return null;
  if (ghost.stage === 'emojiOnly' && new Date(ghost.emojiUntil).getTime() <= now) return 'full';
  return ghost.stage;
}

// Shapes a stored ghost for the browser
export function formatGhost(ghost) {
  if (!ghost?.by) return null;
  return {
    by: String(ghost.by),
    stage: ghostStage(ghost),
    messageId: ghost.messageId ? String(ghost.messageId) : null,
    emojiUntil: ghost.emojiUntil || null,
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
