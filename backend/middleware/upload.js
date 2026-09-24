import multer from 'multer';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from '../utils/storage.js';

function fileFilter(req, file, callback) {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return callback(null, true);
  const error = new Error('Only JPG, PNG and WEBP images are allowed.');
  error.status = 400;
  callback(error);
}

// Keeps the uploaded file in memory; utils/storage.js resizes and saves it
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter,
});

// Several pictures at once, for a 🌟 sticker pack
export const imagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 30 },
  fileFilter,
});
