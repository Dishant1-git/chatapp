// 🌟 Stickers: built-in packs, drawn as SVGs in public/stickers.
// A sticker message only carries its id, inside the encrypted message, so the
// server never learns which one was sent.

export const STICKER_PACKS = [
  {
    id: 'ghosts',
    name: '👻 Ghosts',
    stickers: [
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
    ],
  },
  {
    id: 'duo',
    name: '🧸 Bear & Panda',
    stickers: [
      { id: 'duo-hug', label: 'Hug' },
      { id: 'duo-love', label: 'Love you' },
      { id: 'duo-kiss', label: 'Kiss' },
      { id: 'duo-sulk', label: 'Sulking' },
      { id: 'duo-cry', label: 'There there' },
      { id: 'duo-cheer', label: 'Yay' },
      { id: 'duo-sleep', label: 'Sleepy' },
      { id: 'duo-dance', label: 'Dancing' },
      { id: 'duo-gift', label: 'A present' },
      { id: 'duo-shy', label: 'Shy' },
      { id: 'duo-angry', label: 'Angry' },
      { id: 'duo-miss', label: 'Missing you' },
    ],
  },
];

const BY_ID = new Map(STICKER_PACKS.flatMap((pack) => pack.stickers.map((s) => [s.id, s])));

export function isSticker(id) {
  return BY_ID.has(id);
}

export function stickerLabel(id) {
  return BY_ID.get(id)?.label || 'Sticker';
}

export function stickerUrl(id) {
  return `/stickers/${id}.svg`;
}
