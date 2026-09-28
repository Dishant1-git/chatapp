import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { saveImage, saveEncryptedStream } from '../utils/storage.js';

const router = Router();

// POST /api/upload — uploads an (unencrypted) image and returns its URL.
// Only used for pictures that aren't secret, like group photos.
router.post('/', requireAuth, uploadLimiter, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose an image.' });
  const url = await saveImage(req.file.buffer);
  res.status(201).json({ url });
});

// POST /api/upload/encrypted — raw bytes of an image, voice message, video or
// document encrypted in the browser, of any size.
// The URL is then sent with POST /api/messages; the key to open it travels
// inside the encrypted message.
router.post('/encrypted', requireAuth, uploadLimiter, async (req, res) => {
  if (!req.is('application/octet-stream')) return res.status(400).json({ error: 'Nothing to upload.' });
  const url = await saveEncryptedStream(req);
  res.status(201).json({ url });
});

export default router;
