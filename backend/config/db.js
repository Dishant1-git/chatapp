import mongoose from 'mongoose';

// Connects to MongoDB. If the database isn't reachable yet (for example it's
// still starting), keep retrying instead of crashing the server.
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. Add it to backend/.env');

  while (true) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log('> Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`> Could not connect to MongoDB (${err.message}). Retrying in 5 seconds…`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}
