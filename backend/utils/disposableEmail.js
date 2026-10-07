// 🚫 Temporary ("disposable") email addresses: mailinator, 10minutemail, yopmail …
// An inbox that's gone in ten minutes can still receive the verification code,
// so the code alone doesn't prove there's a real person behind the account.
// Sign-up refuses these outright, before an account exists or a code is sent.
//
// Three lists, most to least current:
//  - the online list at LIST_URL (about 290,000 domains gathered from 30-odd
//    sources), fetched when the server starts and again every day;
//  - the `disposable-email-domains` package (about 120,000), which is what's
//    used until the online one has arrived and whenever it can't be fetched;
//  - BLOCKED_EMAIL_DOMAINS in backend/.env, your own additions.
//
// The online list is gathered by machine and is wrong about real providers —
// it lists yahoo.co.in, rediffmail.com, protonmail.com and others. REAL_PROVIDERS
// below always wins over every list, and ALLOWED_EMAIL_DOMAINS in backend/.env
// adds to it: if someone real is turned away, put their domain there.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packaged = new Set(require('disposable-email-domains'));
// Services that hand out any subdomain: "anything.33mail.com"
const wildcard = new Set(require('disposable-email-domains/wildcard.json'));

const LIST_URL = 'https://cdn.jsdelivr.net/gh/shrinathsnayak/disposable-domains/domains.json';
const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30 * 1000;
// A list much shorter than this isn't the list: keep what we had
const SMALLEST_BELIEVABLE_LIST = 50000;

// Never treated as temporary, whatever a list says
const REAL_PROVIDERS = new Set(
  `gmail.com googlemail.com
  outlook.com outlook.in outlook.co.uk hotmail.com hotmail.co.uk hotmail.in hotmail.fr live.com live.in live.co.uk msn.com
  yahoo.com yahoo.in yahoo.co.in yahoo.co.uk yahoo.fr yahoo.de yahoo.ca yahoo.com.au ymail.com rocketmail.com
  icloud.com me.com mac.com
  proton.me protonmail.com protonmail.ch pm.me tutanota.com tutanota.de tuta.io tuta.com
  rediffmail.com rediff.com zoho.com zohomail.com zohomail.in
  aol.com gmx.com gmx.de gmx.net gmx.us mail.com fastmail.com fastmail.fm hey.com duck.com
  yandex.com yandex.ru mail.ru qq.com 163.com 126.com sina.com naver.com daum.net hanmail.net
  web.de t-online.de orange.fr free.fr laposte.net libero.it seznam.cz wp.pl o2.pl
  comcast.net verizon.net att.net sbcglobal.net cox.net btinternet.com sky.com`
    .split(/\s+/)
    .filter(Boolean)
);

function listed(variable) {
  return String(process.env[variable] || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

let online = null; // the fetched list, once there is one

async function refresh() {
  try {
    const response = await fetch(LIST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`answered ${response.status}`);
    const data = await response.json();
    const domains = (Array.isArray(data) ? data : data.domains || []).filter((d) => typeof d === 'string');
    if (domains.length < SMALLEST_BELIEVABLE_LIST) throw new Error(`only ${domains.length} domains in it`);
    online = new Set(domains.map((d) => d.trim().toLowerCase()));
  } catch (err) {
    // Keeps the previous copy, or the packaged list if there never was one
    console.error('[temp-mail] could not refresh the online list:', err.message);
  }
}

// Called once when the server starts. Not waited for: sign-ups in the first
// seconds are checked against the packaged list.
export function loadDisposableDomains() {
  refresh();
  setInterval(refresh, REFRESH_EVERY_MS).unref();
}

export function isDisposableEmail(email) {
  const domain = String(email).trim().toLowerCase().split('@').pop();
  if (!domain) return false;
  if (REAL_PROVIDERS.has(domain) || listed('ALLOWED_EMAIL_DOMAINS').includes(domain)) return false;
  const extra = listed('BLOCKED_EMAIL_DOMAINS');

  // "a.b.example.com" is checked as itself, then as each parent domain
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (extra.includes(candidate)) return true;
    if (i === 0 ? packaged.has(candidate) || online?.has(candidate) : wildcard.has(candidate)) return true;
  }
  return false;
}
