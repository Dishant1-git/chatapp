import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import StickerPack, { MAX_PACKS_PER_USER, MAX_STICKERS_PER_PACK, formatPack } from '../models/StickerPack.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { imagesUpload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { deleteImage, saveImage } from '../utils/storage.js';

// 🌟 Sticker packs: made by one person, installable by everyone.
// Nothing here ever says who made a pack.

const router = Router();
router.use(requireAuth);

async function installedIds(userId) {
  const user = await User.findById(userId).select('stickerPacks');
  return (user?.stickerPacks || []).map(String);
}

// GET /api/stickers/packs — the public packs plus my own, most installed first
router.get('/packs', async (req, res) => {
  const [packs, installed] = await Promise.all([
    StickerPack.find({ $or: [{ isPublic: { $ne: false } }, { createdBy: req.userId }] })
      .sort({ installs: -1, createdAt: -1 })
      .limit(200),
    installedIds(req.userId),
  ]);
  res.json({
    packs: packs.map((pack) =>
      formatPack(pack, {
        isInstalled: installed.includes(String(pack._id)),
        isMine: String(pack.createdBy) === req.userId,
      })
    ),
  });
});

// GET /api/stickers/installed — the packs in my sticker picker
router.get('/installed', async (req, res) => {
  const user = await User.findById(req.userId).select('stickerPacks').populate('stickerPacks');
  const packs = (user?.stickerPacks || []).filter(Boolean);
  res.json({
    packs: packs.map((pack) => formatPack(pack, { isInstalled: true, isMine: String(pack.createdBy) === req.userId })),
  });
});

// POST /api/stickers/packs — multipart: name + up to 30 images.
// The pack is public straight away, and installed for whoever made it.
router.post('/packs', uploadLimiter, imagesUpload.array('images', MAX_STICKERS_PER_PACK), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const files = req.files || [];

  if (name.length < 2 || name.length > 30) return res.status(400).json({ error: 'The pack name must be 2–30 characters.' });
  if (!files.length) return res.status(400).json({ error: 'Please choose at least one picture.' });

  const mine = await StickerPack.countDocuments({ createdBy: req.userId });
  if (mine >= MAX_PACKS_PER_USER) {
    return res.status(400).json({ error: `You can make up to ${MAX_PACKS_PER_USER} packs.` });
  }

  const stickers = [];
  try {
    for (const file of files) stickers.push({ url: await saveImage(file.buffer, { maxSize: 320 }) });
  } catch (err) {
    await Promise.all(stickers.map((s) => deleteImage(s.url)));
    throw err;
  }

  const pack = await StickerPack.create({
    name,
    stickers,
    createdBy: req.userId,
    isPublic: String(req.body?.isPublic ?? 'true') !== 'false',
    installs: 1,
  });
  await User.updateOne({ _id: req.userId }, { $addToSet: { stickerPacks: pack._id } });
  res.status(201).json({ pack: formatPack(pack, { isInstalled: true, isMine: true }) });
});

// POST /api/stickers/packs/:id/install — add it to my picker (DELETE removes it)
router.post('/packs/:id/install', async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(404).json({ error: 'Pack not found.' });

  const pack = await StickerPack.findById(id);
  if (!pack) return res.status(404).json({ error: 'Pack not found.' });

  const added = await User.updateOne({ _id: req.userId }, { $addToSet: { stickerPacks: pack._id } });
  if (added.modifiedCount) await StickerPack.updateOne({ _id: pack._id }, { $inc: { installs: 1 } });
  res.json({ pack: formatPack(pack, { isInstalled: true, isMine: String(pack.createdBy) === req.userId }) });
});

router.delete('/packs/:id/install', async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(404).json({ error: 'Pack not found.' });

  const removed = await User.updateOne({ _id: req.userId }, { $pull: { stickerPacks: id } });
  if (removed.modifiedCount) await StickerPack.updateOne({ _id: id, installs: { $gt: 0 } }, { $inc: { installs: -1 } });
  res.json({ ok: true });
});

// DELETE /api/stickers/packs/:id — only whoever made it can take it down,
// and then it's gone for everyone who installed it
router.delete('/packs/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(404).json({ error: 'Pack not found.' });

  const pack = await StickerPack.findOneAndDelete({ _id: id, createdBy: req.userId });
  if (!pack) return res.status(404).json({ error: 'Pack not found.' });

  await User.updateMany({ stickerPacks: pack._id }, { $pull: { stickerPacks: pack._id } });
  await Promise.all(pack.stickers.map((s) => deleteImage(s.url)));
  res.json({ ok: true });
});

export default router;
