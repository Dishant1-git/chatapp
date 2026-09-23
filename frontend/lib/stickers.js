// 🌟 Stickers: a small built-in pack, drawn as SVGs in public/stickers.
// A sticker message only carries its id, inside the encrypted message, so the
// server never learns which one was sent.

export const STICKERS = [
  { id: 'ghost-wave', label: 'Hello' },
  { id: 'ghost-love', label: 'In love' },
  { id: 'ghost-laugh', label: 'Laughing' },
  { id: 'ghost-cry', label: 'Crying' },
  { id: 'ghost-peek', label: 'Peeking' },
  { id: 'ghost-sleep', label: 'Sleeping' },
  { id: 'ghost-shrug', label: 'Shrug' },
  { id: 'ghost-cool', label: 'Too cool' },
  { id: 'ghost-party', label: 'Party' },
  { id: 'ghost-shock', label: 'Shocked' },
  { id: 'heart-broken', label: 'Broken heart' },
  { id: 'fire-streak', label: 'On fire' },
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

export function isSticker(id) {
  return BY_ID.has(id);
}

export function stickerLabel(id) {
  return BY_ID.get(id)?.label || 'Sticker';
}

export function stickerUrl(id) {
  return `/stickers/${id}.svg`;
}
