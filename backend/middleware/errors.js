import multer from 'multer';
import { isDatabaseConnected } from '../config/db.js';

// Answer quickly with a friendly message instead of hanging while MongoDB is down
export function requireDatabase(req, res, next) {
  if (isDatabaseConnected()) return next();
  res.status(503).json({ error: 'The database is unavailable right now. Please try again shortly.' });
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

// Express 5 sends errors thrown in async route handlers here automatically.
// All four arguments are needed — that's how Express recognises an error handler.
export function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large. The maximum size is 5 MB.' : 'Invalid upload.';
    return res.status(400).json({ error: message });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'This is too large to send.' });
  }

  // Invalid JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  // Errors we created on purpose carry a status and a user-friendly message
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error('[api]', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
