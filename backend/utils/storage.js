import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Images are stored on the local disk and served at /uploads/<name>.
// To move to Cloudinary or S3 later, only saveImage() needs to change —
// it just has to return a URL.

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Matches the URLs saveImage() produces. Used to reject image URLs we didn't create.
export const UPLOAD_URL_PATTERN = /^\/uploads\/[a-f0-9]{32}\.webp$/;

export function getUploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || 'uploads');
}

// Resizes the image, converts it to WEBP and saves it. Returns the public URL.
// Re-encoding with sharp also guarantees the file really is an image —
// a renamed script or corrupted file will throw here.
export async function saveImage(buffer, { maxSize = 1600 } = {}) {
  let output;
  try {
    output = await sharp(buffer)
      .rotate() // respect the phone camera's orientation
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    const error = new Error('This file is not a valid image.');
    error.status = 400;
    throw error;
  }

  const fileName = `${crypto.randomBytes(16).toString('hex')}.webp`;
  await fs.mkdir(getUploadDir(), { recursive: true });
  await fs.writeFile(path.join(getUploadDir(), fileName), output);

  return `/uploads/${fileName}`;
}

export async function deleteImage(url) {
  if (!UPLOAD_URL_PATTERN.test(url)) return;
  await fs.unlink(path.join(getUploadDir(), path.basename(url))).catch(() => {});
}
