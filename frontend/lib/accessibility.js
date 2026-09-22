// ♿ Accessibility settings: text size, text colour and reading messages aloud.
// Saved in this browser only. app/layout.js applies them before the page is
// drawn (so there's no flash), and applyAccessibility() applies changes live.

const STORAGE_KEY = 'ghosted:accessibility';

export const FONT_SIZES = [
  { value: 0.9, label: 'Small' },
  { value: 1, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Extra large' },
];

// Keep in sync with the [data-text-color] rules in app/globals.css
export const TEXT_COLORS = [
  { value: 'default', label: 'Default', swatch: '#111827' },
  { value: 'contrast', label: 'High contrast', swatch: '#000000' },
  { value: 'blue', label: 'Blue', swatch: '#1e3a8a' },
  { value: 'green', label: 'Green', swatch: '#14532d' },
  { value: 'purple', label: 'Purple', swatch: '#4c1d95' },
  { value: 'brown', label: 'Brown', swatch: '#5b3a1a' },
];

export const DEFAULT_SETTINGS = { fontScale: 1, textColor: 'default', readAloud: false };

export function loadAccessibility() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAccessibility(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the settings still apply until the page is closed
  }
  applyAccessibility(settings);
}

export function applyAccessibility(settings) {
  const root = document.documentElement;
  root.style.setProperty('--font-scale', String(settings.fontScale || 1));
  if (settings.textColor && settings.textColor !== 'default') root.dataset.textColor = settings.textColor;
  else delete root.dataset.textColor;
}

// The same, as a tiny script for app/layout.js to run before the page paints
export const ACCESSIBILITY_SCRIPT = `
try {
  var a = JSON.parse(localStorage.getItem('${STORAGE_KEY}') || '{}');
  if (a.fontScale) document.documentElement.style.setProperty('--font-scale', String(a.fontScale));
  if (a.textColor && a.textColor !== 'default') document.documentElement.dataset.textColor = a.textColor;
} catch (e) {}
`;

// 🔊 Reads text aloud with the browser's built-in voice (Web Speech API)
export function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}
