// 📝 What's typed but not sent yet is kept per chat, so going back by mistake
// doesn't lose it — and the chat list can show "Draft: …" for that chat.
// sessionStorage: it stays on this device and goes with the tab.
import { useSyncExternalStore } from 'react';

const draftKey = (conversationId) => `draft:${conversationId}`;
const listeners = new Set();

export function readDraft(conversationId) {
  try {
    return sessionStorage.getItem(draftKey(conversationId)) || '';
  } catch {
    return '';
  }
}

export function saveDraft(conversationId, value) {
  try {
    if (value) sessionStorage.setItem(draftKey(conversationId), value);
    else sessionStorage.removeItem(draftKey(conversationId));
  } catch {
    // Storage is off or full: the draft just isn't kept
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The chat's draft, kept up to date while it's being typed
export function useDraft(conversationId) {
  return useSyncExternalStore(
    subscribe,
    () => readDraft(conversationId),
    () => ''
  );
}
