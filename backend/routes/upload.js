import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { saveImage } from '../utils/storage.js';

const router = Router();

// POST /api/upload — uploads a chat image and returns its URL.
// The URL is then sent with POST /api/messages.
router.post('/', requireAuth, uploadLimiter, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose an image.' });
  const url = await saveImage(req.file.buffer);
  res.status(201).json({ url });
});

export default router;
