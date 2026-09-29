// 🎁 Gift messages: a text message that arrives wrapped, and is opened with a
// little animation. The mood and reveal style travel inside the encrypted
// message, so the server never knows which one was picked (see lib/e2ee.js).

// The mood sets the colours, the particles and the reveal style picked by default.
// color is only ever a background behind white text, so each one is dark enough for that.
export const MOODS = {
  love: { emoji: '❤️', label: 'Love', style: 'letter', color: '#e0457b', particles: ['❤️', '💖', '💕'] },
  funny: { emoji: '😂', label: 'Funny', style: 'mystery', color: '#c77d00', particles: ['😂', '🤣', '💥'] },
  emotional: { emoji: '🥹', label: 'Emotional', style: 'galaxy', color: '#6b7fd7', particles: ['🥹', '✨', '💫'] },
  celebration: { emoji: '🎉', label: 'Celebration', style: 'wrapped', color: '#e8553a', particles: ['🎉', '🎊', '✨'] },
  teasing: { emoji: '😈', label: 'Teasing', style: 'balloon', color: '#9b4fd1', particles: ['😈', '😏', '💜'] },
  secret: { emoji: '🤫', label: 'Secret', style: 'secret', color: '#3f4a5a', particles: ['🤫', '🔐', '✨'] },
  appreciation: { emoji: '🫶', label: 'Appreciation', style: 'magic', color: '#2f9e7a', particles: ['🫶', '🌟', '💚'] },
};

// How the message is revealed. hint: what the receiver is asked to do.
export const STYLES = {
  wrapped: { emoji: '🎁', label: 'Wrapped', hint: 'Tap to unwrap' },
  letter: { emoji: '💌', label: 'Love letter', hint: 'Tap to open the letter' },
  frozen: { emoji: '🧊', label: 'Frozen', hint: 'Tap the ice to crack it' },
  secret: { emoji: '🔐', label: 'Secret', hint: 'Hold to reveal' },
  ticket: { emoji: '🎟️', label: 'Ticket', hint: 'Tear the ticket' },
  galaxy: { emoji: '🌌', label: 'Galaxy', hint: 'Tap to launch' },
  balloon: { emoji: '🎈', label: 'Balloons', hint: 'Pop the balloons' },
  puzzle: { emoji: '🧩', label: 'Puzzle', hint: 'Turn every piece the right way up' },
  magic: { emoji: '🪄', label: 'Magic', hint: 'Tap the wand' },
  mystery: { emoji: '📦', label: 'Mystery box', hint: 'Tap the box' },
};

export const DEFAULT_MOOD = 'love';

// The gift details from a decrypted payload. They come from the sender, so
// anything unknown falls back to something we know how to draw.
export function readGift(gift) {
  if (!gift || typeof gift !== 'object') return null;
  const mood = MOODS[gift.mood] ? gift.mood : DEFAULT_MOOD;
  const style = STYLES[gift.style] ? gift.style : MOODS[mood].style;
  return { mood, style, together: gift.together === true };
}

// Still wrapped for me: someone else's gift that I haven't opened yet
export function isWrappedFor(message, myId) {
  if (!message?.gift || message.isDeleted || message.undecryptable || !myId) return false;
  if (String(message.senderId) === String(myId)) return false;
  return !(message.unwrappedBy || []).some((id) => String(id) === String(myId));
}

// Did everyone it was sent to open it? (what the sender sees)
export function isUnwrappedByAll(message) {
  const recipients = message.recipients || [];
  const opened = message.unwrappedBy || [];
  return recipients.length > 0 && recipients.every((id) => opened.some((o) => String(o) === String(id)));
}
