import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/upload.js';
import keyRoutes from './routes/keys.js';
import callRoutes from './routes/calls.js';
import socialRoutes from './routes/social.js';
import stickerRoutes from './routes/stickers.js';
import gifRoutes from './routes/gifs.js';
import chatActionRoutes from './routes/chatActions.js';
import scheduledRoutes from './routes/scheduled.js';
import healthRoutes from './routes/health.js';
import { requireDatabase, notFound, errorHandler } from './middleware/errors.js';
import { serveUpload } from './utils/storage.js';

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

  // Uploaded images, voice messages and video notes (stored in MongoDB)
  app.get('/uploads/:name', requireDatabase, serveUpload);

  // Before requireDatabase, so it can report a database problem instead of being blocked by it
  app.use('/api/health', healthRoutes);

  app.use('/api', requireDatabase);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/conversations', conversationRoutes);
  // Ghost levels, forgiveness, pause, revive, inside jokes, undo seen, vibe stats
  app.use('/api/conversations', socialRoutes);
  // Block, clear chat, delete chat and nicknames
  app.use('/api/conversations', chatActionRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/scheduled', scheduledRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/stickers', stickerRoutes);
  app.use('/api/gifs', gifRoutes);
  app.use('/api/keys', keyRoutes);
  app.use('/api/calls', callRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
