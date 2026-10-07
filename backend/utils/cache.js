import { createClient } from 'redis';

// 🧠 A cache for answers that are slow to work out and safe to reuse for a
// while: streaks (an aggregate over 400 days of messages, asked for every time
// the app opens) and GIF searches (a trip to GIPHY).
//
// Set REDIS_URL in backend/.env to keep it in Redis (a free Upstash or Render
// Key Value instance is plenty). Without it the cache lives in this process's
// memory, which gives the same saving on a single server and is simply emptied
// by a restart.
//
// The cache is never in the way: Redis being slow, down or wrong is treated as
// "not cached" and the answer is worked out as before. And nothing private is
// kept here — numbers and public GIF links, never messages or keys.

const MEMORY_LIMIT = 5000; // entries, when there's no Redis
const memory = new Map(); // key → { value, expires }
let redis = null;

// Not waited for: the server starts whether or not Redis answers, and the
// client keeps trying in the background. Until it's connected (and whenever
// it drops) the cache is kept in memory instead, as if there were no Redis.
export function connectCache() {
  const url = String(process.env.REDIS_URL || '').trim();
  if (!url) return;

  const client = createClient({
    url,
    // While Redis is unreachable a command fails at once (and counts as a miss)
    // instead of queueing up and making requests wait for it to come back
    disableOfflineQueue: true,
    socket: { connectTimeout: 5000, reconnectStrategy: (retries) => Math.min(retries * 500, 15000) },
  });
  let complained = false;
  client.on('error', (err) => {
    if (!complained) console.error('[cache] Redis:', err.message);
    complained = true;
  });
  client.on('ready', () => {
    complained = false;
    console.log('> Cache: connected to Redis');
  });

  redis = client;
  client.connect().catch(() => {}); // reported by the 'error' handler above
}

// Redis, but only while it's actually connected
const live = () => (redis?.isReady ? redis : null);

// Where the cache is right now, for /api/health: 'redis', or 'memory' with why
export function cacheStatus() {
  if (live()) return 'redis';
  return redis ? 'memory (Redis is set but not reachable)' : 'memory (no REDIS_URL)';
}

function remember(key, value, ttlSeconds) {
  // A Map keeps insertion order, so the first key is the oldest
  if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value);
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

function recall(key) {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expires > Date.now()) return entry.value;
  memory.delete(key);
  return undefined;
}

// The cached values for `keys`, in the same order; undefined where there's none
export async function getMany(keys) {
  if (!keys.length) return [];
  const store = live();
  if (!store) return keys.map(recall);
  try {
    const found = await store.mGet(keys);
    return found.map((text) => (text == null ? undefined : JSON.parse(text)));
  } catch {
    return keys.map(() => undefined);
  }
}

// entries: [[key, value], …]
export async function setMany(entries, ttlSeconds) {
  if (!entries.length) return;
  const store = live();
  if (!store) return entries.forEach(([key, value]) => remember(key, value, ttlSeconds));
  try {
    const batch = store.multi();
    entries.forEach(([key, value]) => batch.set(key, JSON.stringify(value), { EX: ttlSeconds }));
    await batch.exec();
  } catch {
    // Not cached this time
  }
}

// The cached answer for `key`, or work() — whose answer is then kept for ttlSeconds
export async function cached(key, ttlSeconds, work) {
  const [hit] = await getMany([key]);
  if (hit !== undefined) return hit;
  const value = await work();
  await setMany([[key, value]], ttlSeconds);
  return value;
}
