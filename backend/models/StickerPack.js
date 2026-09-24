import mongoose from 'mongoose';

// 🌟 A sticker pack anyone can install.
// Packs are public: everyone using the app can see and install them. Who made
// a pack is stored (so they can delete it) but never sent to anyone — only the
// pack's name and its stickers are shown.

export const MAX_STICKERS_PER_PACK = 30;
export const MAX_PACKS_PER_USER = 20;

const stickerPackSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    stickers: {
      type: [new mongoose.Schema({ url: { type: String, required: true } }, { _id: true, timestamps: false })],
      validate: [(list) => list.length > 0 && list.length <= MAX_STICKERS_PER_PACK, 'A pack needs 1–30 stickers.'],
    },
    // Never returned by the API
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    installs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// The store lists the most-installed packs first
stickerPackSchema.index({ installs: -1, createdAt: -1 });

// What everyone may see: the name and the pictures, never the author
export function formatPack(pack, { isInstalled = false, isMine = false } = {}) {
  return {
    _id: String(pack._id),
    name: pack.name,
    stickers: pack.stickers.map((s) => ({ _id: String(s._id), url: s.url })),
    installs: pack.installs,
    isInstalled,
    isMine,
  };
}

const StickerPack = mongoose.model('StickerPack', stickerPackSchema);

export default StickerPack;
