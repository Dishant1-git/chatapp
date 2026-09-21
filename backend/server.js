import dotenv from 'dotenv';
import http from 'node:http';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { migrate } from './config/migrate.js';
import { setupSocket } from './socket/index.js';
import User from './models/User.js';

dotenv.config({ quiet: true });

if (!process.env.JWT_SECRET) {
  console.error('> JWT_SECRET is not set. Copy backend/.env.example to backend/.env and fill it in.');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '5000', 10);
// Comma-separated list, e.g. "http://localhost:3000,https://chat.example.com".
// Trailing slashes are removed because browsers send the origin without one.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const app = createApp(allowedOrigins);
const server = http.createServer(app);
setupSocket(server, allowedOrigins);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`> Port ${PORT} is already in use. Set a different PORT in backend/.env`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`> API and Socket.IO ready on http://localhost:${PORT}`);
});

await connectDB();
await migrate();
// If the server crashed earlier, some users may still be marked online
await User.updateMany({ isOnline: true }, { isOnline: false });
