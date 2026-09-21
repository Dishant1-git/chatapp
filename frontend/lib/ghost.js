// Ghosting rules. Keep in sync with backend/utils/ghost.js
//
// When A ghosts B, the conversation's "ghost" moves through these stages:
//   pending   — B may send exactly one message to change A's mind
//   awaiting  — B used it; B can't send anything until A decides
//   emojiOnly — A chose to ghost B; B can only send emojis for 15 minutes
//   full      — the 15 minutes are over; B can't send anything

// The server sends the stage it saw; "emojiOnly" turns into "full" on the clock
export function ghostStage(ghost, now = Date.now()) {
  if (!ghost?.by) return null;
  if (ghost.stage === 'emojiOnly' && new Date(ghost.emojiUntil).getTime() <= now) return 'full';
  return ghost.stage;
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
