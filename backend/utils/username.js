import User from '../models/User.js';

// 🏷️ @usernames: the short handle people can be found by, next to the email.
// Lower case, 3–20 characters, letters, digits and underscores, starting with
// a letter — short enough to type, boring enough to be predictable.
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;
export const USERNAME_RULES = 'Usernames are 3–20 characters: letters, numbers and underscores, starting with a letter.';

// Names the app itself uses, or that would be confusing to hand out
const RESERVED = new Set([
  'admin', 'administrator', 'ghost', 'ghosted', 'ghostled', 'support', 'help', 'team', 'staff',
  'root', 'system', 'security', 'moderator', 'mod', 'everyone', 'all', 'me', 'you', 'null',
  'undefined', 'api', 'login', 'register', 'verify', 'chat', 'chats', 'settings', 'profile',
]);

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

// '' when it's fine, otherwise why not
export function usernameProblem(username) {
  if (!username) return 'Please pick a username.';
  if (!USERNAME_PATTERN.test(username)) return USERNAME_RULES;
  if (RESERVED.has(username)) return 'That username is reserved. Please pick another one.';
  return '';
}

// Turns anything — a name, an email address — into a usable starting point
export function usernameFrom(text = '') {
  const base = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, 16);
  return base.length >= 3 ? base : `ghost${base}`.slice(0, 16);
}

// Free usernames close to the one they wanted: dishant7, dishant_09, itsdishant…
export async function suggestUsernames(wanted, { limit = 3 } = {}) {
  const base = usernameFrom(wanted) || 'ghost';
  const short = base.slice(0, 14);

  const candidates = [
    `${short}${Math.floor(Math.random() * 90) + 10}`,
    `${short}_${Math.floor(Math.random() * 900) + 100}`,
    `its${short}`.slice(0, 20),
    `${short}_here`.slice(0, 20),
    `real${short}`.slice(0, 20),
    `${short}${Math.floor(Math.random() * 9000) + 1000}`,
  ].filter((name) => USERNAME_PATTERN.test(name) && !RESERVED.has(name));

  // One query for all of them, then keep the ones nobody has
  const taken = new Set(
    (await User.find({ username: { $in: candidates } }).select('username').lean()).map((u) => u.username)
  );
  return candidates.filter((name) => !taken.has(name)).slice(0, limit);
}

export async function usernameTaken(username) {
  return Boolean(await User.exists({ username }));
}

// A free username for an account that doesn't have one yet (the migration, and
// anywhere a username has to be invented rather than chosen)
export async function freeUsernameFrom(text) {
  const base = usernameFrom(text);
  if (!RESERVED.has(base) && USERNAME_PATTERN.test(base) && !(await usernameTaken(base))) return base;

  for (let i = 0; i < 50; i++) {
    const candidate = `${base.slice(0, 15)}${Math.floor(Math.random() * 9000) + 1000}`;
    if (!(await usernameTaken(candidate))) return candidate;
  }
  // Ridiculously unlikely, but never hand back something that's taken
  return `ghost${Date.now().toString(36)}`.slice(0, 20);
}
