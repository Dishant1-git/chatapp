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
// it lists yahoo.co.in, rediffmail.com, google.com, microsoft.com and others.
// So it is never believed on its own: REAL_PROVIDERS below always wins, and a
// domain it names is only refused if its mail doesn't go to one of the big
// real mail hosts (see emailProblem). ALLOWED_EMAIL_DOMAINS in backend/.env
// adds to the real ones: if someone real is turned away, put their domain there.
//
// Sign-up uses emailProblem(), which also looks at where a domain's mail is
// delivered — that's what catches a temp-mail domain too new for any list.
import { createRequire } from 'node:module';
import { promises as dns } from 'node:dns';
import { getMany, setMany } from './cache.js';

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
  comcast.net verizon.net att.net sbcglobal.net cox.net btinternet.com sky.com
  google.com zoho.in zohomail.eu outlook.fr outlook.de outlook.es outlook.it hotmail.it hotmail.de hotmail.es live.fr live.com.au
  yahoo.es yahoo.it yahoo.co.jp yahoo.com.br yahoo.com.sg yahoo.co.id
  bk.ru inbox.ru list.ru yandex.ua yandex.by yandex.kz rambler.ru
  tutamail.com mailbox.org posteo.de hushmail.com runbox.com gmx.fr gmx.at gmx.ch`
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

// ---- What a list can't know ----

// Temp-mail services put up new domains every day, faster than any list
// follows. But the new domain still has to deliver its mail somewhere, and
// that somewhere — its MX host — is the service's own machine, the same one
// its listed domains use. So a domain nobody has heard of is judged by where
// its mail goes.
const DNS_TIMEOUT_MS = 4000;
// Mail hosts that only temp-mail services use, and that the lists don't name
const TEMP_MAIL_HOSTS = ['fex.plus', 'mail.tm', 'mail.gw', '1secmail.com', 'tempmail.lol', 'dropmail.me', 'emailfake.com', 'generator.email', 'temp-mail.io', 'tempmail.plus', 'mailsac.com', 'erine.email', 'tmail.gg', 'priyo.email'];

// Where real organisations get their mail: Google Workspace, Microsoft 365,
// Zoho, the big filtering services. A temp-mail service doesn't pay for these,
// so a domain whose mail lands here is somebody's real address — which is how
// the online list's mistakes (it names microsoft.com, and any number of
// colleges and companies) are told apart from its catches.
const TRUSTED_MAIL_HOSTS = ['google.com', 'googlemail.com', 'outlook.com', 'office365.us', 'yahoodns.net', 'zoho.com', 'zoho.in', 'zoho.eu', 'icloud.com', 'apple.com', 'pphosted.com', 'mimecast.com', 'iphmx.com', 'barracudanetworks.com'];

// "mx.fex.plus" → mx.fex.plus, fex.plus
const parentsOf = (host) => host.split('.').map((_, i, parts) => parts.slice(i).join('.')).slice(0, -1);
const trustedHost = (host) => parentsOf(host).some((name) => TRUSTED_MAIL_HOSTS.includes(name));
// Only the curated list judges a mail host: the online one names google.com,
// zoho.in and yandex.net as temporary
const tempMailHost = (host) =>
  !trustedHost(host) &&
  parentsOf(host).some((name) => packaged.has(name) || TEMP_MAIL_HOSTS.includes(name) || listed('BLOCKED_EMAIL_DOMAINS').includes(name));

// The domain's mail hosts; [] if it has none; null if DNS couldn't say
async function mailHostsOf(domain) {
  const within = (lookup) =>
    Promise.race([
      lookup,
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS)),
    ]);
  const missing = (err) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(err.code);
  try {
    const records = await within(dns.resolveMx(domain));
    return records.map((record) => String(record.exchange).toLowerCase().replace(/\.$/, '')).filter(Boolean);
  } catch (err) {
    if (!missing(err)) return null;
  }
  // No MX record: mail falls back to the domain's own address, if it has one
  try {
    return (await within(dns.resolve4(domain))).length ? [domain] : [];
  } catch (err) {
    return missing(err) ? [] : null;
  }
}

// Why this address can't be used to sign up, or null if it can:
//   { error, code: 'EMAIL_DISPOSABLE' }   a temporary inbox
//   { error, code: 'EMAIL_UNREACHABLE' }  a domain that can't receive mail at all
// When DNS itself can't be reached the address gets the benefit of the doubt:
// a real person is never turned away because a lookup timed out.
export async function emailProblem(email) {
  const disposable = {
    error: 'Temporary email addresses can’t be used here. Please sign up with your real email.',
    code: 'EMAIL_DISPOSABLE',
  };
  const unreachable = { error: 'That email address can’t receive mail. Please check it for typos.', code: 'EMAIL_UNREACHABLE' };

  const domain = String(email).trim().toLowerCase().split('@').pop();
  if (!domain) return unreachable;
  if (REAL_PROVIDERS.has(domain) || listed('ALLOWED_EMAIL_DOMAINS').includes(domain)) return null;
  // The curated list and your own additions are taken at their word
  const names = parentsOf(domain);
  if (names.some((name, i) => listed('BLOCKED_EMAIL_DOMAINS').includes(name) || (i === 0 ? packaged.has(name) : wildcard.has(name)))) {
    return disposable;
  }

  const onlineSaysSo = Boolean(online?.has(domain));
  const hosts = await mailHostsOf(domain);
  if (hosts === null) return onlineSaysSo ? disposable : null; // DNS is down: go by the list alone
  if (!hosts.length) return unreachable;
  if (hosts.some(tempMailHost)) return disposable;
  // The online list is only believed when the mail doesn't go somewhere real
  if (onlineSaysSo && !hosts.some(trustedHost)) return disposable;
  // Nothing here knows this domain to be temporary. Last, ask the service whose
  // whole job that is — only now, because its free plan allows few questions a day.
  return (await verifyMailSaysTemporary(domain)) ? disposable : null;
}

// ---- VerifyMail (verifymail.io) ----
//
// A paid-for second opinion on the domains nothing above could place. Set
// TEMPMAIL_Verify_API (or VERIFYMAIL_API_KEY) in the environment to switch it on.
//  - Only the domain is sent, never the address.
//  - It's asked last and each answer is kept for a week (utils/cache.js), so
//    gmail.com, the listed temp domains and anything seen recently cost nothing.
//  - Over its daily limit, slow or down, it simply has no opinion: sign-up
//    carries on with what the checks above decided.
const VERIFYMAIL_URL = 'https://verifymail.io/api';
const VERIFYMAIL_TIMEOUT_MS = 5000;
const VERDICT_KEPT_SECONDS = 7 * 24 * 60 * 60;
let overLimitUntil = 0;

function verifyMailKey() {
  return String(process.env.TEMPMAIL_Verify_API || process.env.VERIFYMAIL_API_KEY || '').trim();
}

// true: a temporary-mail domain. false: not, or nobody could say.
async function verifyMailSaysTemporary(domain) {
  const key = verifyMailKey();
  if (!key) return false;

  const cacheKey = `mailcheck:${domain}`;
  const [known] = await getMany([cacheKey]);
  if (known !== undefined) return known;
  // The day's questions are used up: no point asking again for a while
  if (Date.now() < overLimitUntil) return false;

  try {
    const response = await fetch(`${VERIFYMAIL_URL}/${encodeURIComponent(domain)}?key=${key}`, {
      signal: AbortSignal.timeout(VERIFYMAIL_TIMEOUT_MS),
    });
    if (response.status === 429) {
      overLimitUntil = Date.now() + 60 * 60 * 1000;
      console.warn('[temp-mail] VerifyMail’s daily limit is used up; carrying on with the built-in checks.');
      return false;
    }
    if (!response.ok) throw new Error(`answered ${response.status}`);
    const verdict = await response.json();
    const temporary = verdict.disposable === true || verdict.block === true;
    await setMany([[cacheKey, temporary]], VERDICT_KEPT_SECONDS);
    return temporary;
  } catch (err) {
    console.error('[temp-mail] VerifyMail did not answer:', err.message);
    return false;
  }
}

// One Gmail inbox answers to endless addresses: dots are ignored
// (j.o.h.n@ = john@), anything after a + is ignored (john+1@), and
// googlemail.com is gmail.com. "Temporary Gmail" sites hand these out, and
// they let one person make account after account. This is a pattern matching
// every spelling of the same inbox, to look for an account that already has
// it — or null for an address that isn't Gmail.
export function sameInboxPattern(email) {
  const [local, domain] = String(email).trim().toLowerCase().split('@');
  if (!['gmail.com', 'googlemail.com'].includes(domain)) return null;
  const letters = local.split('+')[0].replace(/\./g, '');
  if (!letters) return null;
  const spaced = [...letters].map((c) => c.replace(/[^a-z0-9]/g, '\\$&')).join('\\.*');
  return new RegExp(`^${spaced}\\.*(\\+[^@]*)?@(gmail|googlemail)\\.com$`);
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
