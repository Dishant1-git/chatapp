// 🔑 What counts as an acceptable password. The browser checks the same rules
// as you type (frontend/lib/password.js) — keep the two in step.
export const MIN_PASSWORD_LENGTH = 8;

// A few that people genuinely still use; the list is short on purpose, it's a
// nudge rather than a real dictionary check
const TOO_COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'letmein1', 'welcome1', 'abc12345',
  'football', 'superman', 'trustno1', 'starwars', 'whatever', 'princess',
]);

// '' when the password is fine, otherwise what's wrong with it
export function passwordProblem(password, { name = '', email = '', username = '' } = {}) {
  const value = String(password || '');

  if (value.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (value.length > 200) return 'That password is too long.';
  if (!/[a-zA-Z]/.test(value)) return 'Password needs at least one letter.';
  if (!/[0-9]/.test(value) && !/[^a-zA-Z0-9]/.test(value)) {
    return 'Password needs at least one number or symbol.';
  }
  if (TOO_COMMON.has(value.toLowerCase())) return 'That password is too easy to guess. Please pick another.';

  // Their own name or address makes a poor password
  const lower = value.toLowerCase();
  const parts = [name, username, String(email).split('@')[0]]
    .map((part) => String(part || '').toLowerCase().trim())
    .filter((part) => part.length >= 4);
  if (parts.some((part) => lower.includes(part))) return 'Please pick a password that isn’t your name or email.';

  return '';
}
