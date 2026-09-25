// 🫣 Privacy screen: blurs what's on screen so the person next to you can't
// read your chats. Everything with the "private" class is blurred until you
// hover it (or tap it on a phone) — see globals.css.
//
// It's a per-device setting, kept in localStorage, and applied before the page
// is painted (PRIVACY_SCRIPT below) so nothing flashes up readable first.
export const PRIVACY_KEY = 'ghosted:privacy';

export function privacyOn() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('privacy');
}

export function setPrivacy(on) {
  document.documentElement.classList.toggle('privacy', on);
  try {
    localStorage.setItem(PRIVACY_KEY, on ? 'on' : 'off');
  } catch {
    // Private browsing can block storage — it still works for this visit
  }
}

// Runs before the first paint, next to the dark-mode script
export const PRIVACY_SCRIPT = `
try {
  if (localStorage.getItem('${PRIVACY_KEY}') === 'on') {
    document.documentElement.classList.add('privacy');
  }
} catch (e) {}
`;
