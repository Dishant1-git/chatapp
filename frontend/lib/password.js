// 🔑 The password rules, checked as you type. The server checks the same ones
// (backend/utils/password.js) — keep the two in step.
export const MIN_PASSWORD_LENGTH = 8;

const TOO_COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'letmein1', 'welcome1', 'abc12345',
  'football', 'superman', 'trustno1', 'starwars', 'whatever', 'princess',
]);

// The checklist shown under the password box
export function passwordRules(password = '', { name = '', email = '', username = '' } = {}) {
  const value = String(password);
  const lower = value.toLowerCase();
  const own = [name, username, String(email).split('@')[0]]
    .map((part) => String(part || '').toLowerCase().trim())
    .filter((part) => part.length >= 4);

  return [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: value.length >= MIN_PASSWORD_LENGTH },
    { label: 'A letter', ok: /[a-zA-Z]/.test(value) },
    { label: 'A number or symbol', ok: /[0-9]/.test(value) || /[^a-zA-Z0-9]/.test(value) },
    {
      label: 'Not your name, email or something obvious',
      ok: value.length > 0 && !TOO_COMMON.has(lower) && !own.some((part) => lower.includes(part)),
    },
  ];
}

export function passwordIsValid(password, about) {
  return passwordRules(password, about).every((rule) => rule.ok);
}

// 0–4, for the little bar: length and variety both count
export function passwordStrength(password = '') {
  const value = String(password);
  if (!value) return { score: 0, label: '' };

  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;
  if (TOO_COMMON.has(value.toLowerCase())) score = 1;

  const capped = Math.min(4, score);
  return { score: capped, label: ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][capped] };
}
