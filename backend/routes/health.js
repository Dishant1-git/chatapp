import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

// Mongoose connection states (mongoose.connection.readyState)
const DATABASE_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

// GET /api/health — used by Render (or any uptime monitor) to check the server.
// Answers 200 when everything works and 503 when the database isn't reachable.
router.get('/', async (req, res) => {
  const database = { status: DATABASE_STATES[mongoose.connection.readyState] || 'unknown' };

  // "connected" can be out of date, so actually ask MongoDB to answer
  if (database.status === 'connected') {
    const startedAt = Date.now();
    try {
      await mongoose.connection.db.command({ ping: 1 });
      database.responseTimeMs = Date.now() - startedAt;
    } catch {
      database.status = 'not responding';
    }
  }

  const healthy = database.status === 'connected';

  res.set('Cache-Control', 'no-store'); // always report the current state
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'error',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database,
  });
});

export default router;
