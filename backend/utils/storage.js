import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import sharp from 'sharp';

// Uploads are stored in MongoDB (GridFS) and served at /uploads/<name>.
// Hosts like Render wipe the local disk on every restart and deploy, so files
// saved there disappeared for everyone except people who still had them cached.
// To move to Cloudinary or S3 later, only this file needs to change.

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Matches the URLs saveImage() produces. Used to reject image URLs we didn't create.
export const UPLOAD_URL_PATTERN = /^\/uploads\/[a-f0-9]{32}\.webp$/;
// Encrypted chat images. The server can't open them, so they're stored as-is.
export const ENCRYPTED_URL_PATTERN = /^\/uploads\/[a-f0-9]{32}\.bin$/;
// Images are resized in the browser first; video notes are capped at 60s of
// low-bitrate video (about 8 MB), voice messages at 5 minutes (about 1.5 MB)
export const MAX_ENCRYPTED_SIZE = 16 * 1024 * 1024;

const FILE_NAME_PATTERN = /^[a-f0-9]{32}\.(webp|bin)$/;
const CONTENT_TYPES = { webp: 'image/webp', bin: 'application/octet-stream' };

// Files uploaded before the move to MongoDB may still be on this disk (in development)
export function getUploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || 'uploads');
}

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}

// A GIF with more than one frame, or an animated WEBP. Both start with a
// fixed signature, so this only reads the first bytes.
function isAnimated(buffer) {
  const head = buffer.subarray(0, 4).toString('latin1');
  if (head === 'GIF8') return buffer.includes(Buffer.from('NETSCAPE2.0')) || countGifFrames(buffer) > 1;
  if (head === 'RIFF') return buffer.subarray(0, 64).includes(Buffer.from('ANMF'));
  return false;
}

// Counts image descriptors, enough to tell a still GIF from a moving one
function countGifFrames(buffer) {
  let frames = 0;
  for (let i = 0; i < buffer.length - 1 && frames < 2; i++) {
    if (buffer[i] === 0x00 && buffer[i + 1] === 0x2c) frames += 1;
  }
  return frames;
}

async function store(buffer, extension) {
  const fileName = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
  await pipeline(Readable.from([buffer]), bucket().openUploadStream(fileName));
  return `/uploads/${fileName}`;
}

// Resizes the image, converts it to WEBP and saves it. Returns the public URL.
// Re-encoding with sharp also guarantees the file really is an image —
// a renamed script or corrupted file will throw here.
export async function saveImage(buffer, { maxSize = 1600 } = {}) {
  let output;
  try {
    // animated: keeps every frame of a GIF (or animated WEBP), so 🎞️ stickers move.
    // .rotate() would flatten them, so it's only used for still pictures.
    const animated = isAnimated(buffer);
    const image = sharp(buffer, { animated });
    output = await (animated ? image : image.rotate())
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    const error = new Error('This file is not a valid image.');
    error.status = 400;
    throw error;
  }
  return store(output, 'webp');
}

// Saves an end-to-end encrypted file exactly as the browser sent it
export async function saveEncryptedFile(buffer) {
  return store(buffer, 'bin');
}

export async function deleteImage(url) {
  if (!UPLOAD_URL_PATTERN.test(url) && !ENCRYPTED_URL_PATTERN.test(url)) return;
  const fileName = path.basename(url);
  try {
    const files = await bucket().find({ filename: fileName }).toArray();
    await Promise.all(files.map((file) => bucket().delete(file._id)));
  } catch {
    // Already gone
  }
  await fs.promises.unlink(path.join(getUploadDir(), fileName)).catch(() => {});
}

// GET /uploads/:name — streams a file from MongoDB (or the old upload folder)
export async function serveUpload(req, res) {
  const { name } = req.params;
  if (!FILE_NAME_PATTERN.test(name)) return res.status(404).end();

  const [file] = await bucket().find({ filename: name }).limit(1).toArray();
  const localPath = path.join(getUploadDir(), name);
  if (!file && !fs.existsSync(localPath)) return res.status(404).end();

  // File names are random and never reused, so they can be cached for a year
  res.set({
    'Content-Type': CONTENT_TYPES[name.split('.').pop()],
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (!file) return res.sendFile(localPath);

  res.set('Content-Length', String(file.length));
  return pipeline(bucket().openDownloadStream(file._id), res).catch(() => res.destroy());
}
