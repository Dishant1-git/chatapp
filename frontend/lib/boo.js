// 👻 Boo: the ghost who lives in the app. Boo sits at the top of the chat list
// for good, answers questions about Ghost-ed, and pops up in a chat where
// you've been ghosted to tease you and suggest something to send.
//
// Boo isn't a real user: there's no conversation on the server. The chat with
// Boo lives at /chat/boo and its history is kept in this browser only.
import { useSyncExternalStore } from 'react';

export const BOO_ID = 'boo';
export const BOO_NAME = 'Boo';
export const BOO_PICTURES = {
  wave: '/stickers/ghost-wave.svg',
  peek: '/stickers/ghost-peek.svg',
  laugh: '/stickers/ghost-laugh.svg',
  cry: '/stickers/ghost-cry.svg',
};

// Whether Boo is out and about: roaming the screen (BooRoamer) and popping up
// where I've been ghosted (BooBuddy). A per-device setting, on until switched off
// (Profile, or the switch in Boo's own chat). Boo's place in the list isn't
// affected by it.
const BOO_KEY = 'ghosted:boo';
const listeners = new Set();

export function booOn() {
  try {
    return localStorage.getItem(BOO_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setBoo(on) {
  const changed = booOn() !== on;
  try {
    localStorage.setItem(BOO_KEY, on ? 'on' : 'off');
  } catch {
    // Private browsing can block storage — Boo just stays as it was
  }
  listeners.forEach((listener) => listener());
  // Boo makes an entrance, or a sad exit (see components/BooShow.jsx)
  if (changed) toggleListeners.forEach((listener) => listener(on));
}

// Called with true / false each time the switch is flipped on this device
const toggleListeners = new Set();

export function onBooToggled(listener) {
  toggleListeners.add(listener);
  return () => toggleListeners.delete(listener);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBooOn() {
  return useSyncExternalStore(subscribe, booOn, () => true);
}

// ---- The chat with Boo ----

const MAX_KEPT = 60;
const chatKey = (userId) => `ghosted:boo:chat:${userId}`;

// [{ from: 'me' | 'boo', text, at }]
export function loadBooChat(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(chatKey(userId)) || '[]');
    return Array.isArray(saved) ? saved.filter((m) => m && typeof m.text === 'string') : [];
  } catch {
    return [];
  }
}

export function saveBooChat(userId, messages) {
  try {
    localStorage.setItem(chatKey(userId), JSON.stringify(messages.slice(-MAX_KEPT)));
  } catch {
    // Storage is off or full: the chat just isn't kept
  }
}

// ---- Popping up where I've been ghosted ----

// Boo opens up by itself once per ghosting; after that it waits to be tapped
const seenKey = (conversationId) => `ghosted:boo:seen:${conversationId}`;

export function booHasSeen(conversationId, ghost) {
  try {
    return localStorage.getItem(seenKey(conversationId)) === String(ghost?.since || '');
  } catch {
    return true;
  }
}

export function markBooSeen(conversationId, ghost) {
  try {
    localStorage.setItem(seenKey(conversationId), String(ghost?.since || ''));
  } catch {
    // never mind
  }
}
