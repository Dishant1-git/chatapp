// 🚫 Temporary ("disposable") email addresses: mailinator, 10minutemail, yopmail …
// An inbox that's gone in ten minutes can still receive the verification code,
// so the code alone doesn't prove there's a real person behind the account.
// Sign-up refuses these outright.
//
// The list is the `disposable-email-domains` package (about 120,000 domains).
// New services appear all the time: `npm update disposable-email-domains` picks
// up the latest, and BLOCKED_EMAIL_DOMAINS in backend/.env adds your own
// (comma-separated) without waiting for it.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const exact = new Set(require('disposable-email-domains'));
// Services that hand out any subdomain: "anything.33mail.com"
const wildcard = new Set(require('disposable-email-domains/wildcard.json'));

function extraDomains() {
  return String(process.env.BLOCKED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isDisposableEmail(email) {
  const domain = String(email).trim().toLowerCase().split('@').pop();
  if (!domain) return false;
  const extra = extraDomains();

  // "a.b.example.com" is checked as itself, then as each parent domain
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (extra.includes(candidate)) return true;
    if (i === 0 ? exact.has(candidate) : wildcard.has(candidate)) return true;
  }
  return false;
}
