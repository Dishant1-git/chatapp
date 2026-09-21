import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/upload.js';
import { requireDatabase, notFound, errorHandler } from './middleware/errors.js';
import { getUploadDir } from './utils/storage.js';

export function createApp(allowedOrigins) {
  const app = express();

  // How many proxies sit in front of us, so req.ip is the visitor's real IP
  // (used by the sign-up rate limiter). By default we trust the frontend when it
  // runs on the same machine. If the frontend runs on another server, set
  // TRUST_PROXY=1. Only the address added by your own proxy is used, so a
  // visitor can't fake their IP by sending an X-Forwarded-For header.
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 'loopback');

  app.use(
    helmet({
      // Let the frontend (a different origin in development) display our images
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Uploaded images. File names are random and never reused, so cache them for a year.
  app.use('/uploads', express.static(getUploadDir(), { maxAge: '365d', immutable: true, fallthrough: false }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api', requireDatabase);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/upload', uploadRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
