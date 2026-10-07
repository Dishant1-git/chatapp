// 🎙️ Voice commands: "Hey Boo, call Harinder", "Hey Boo, tell Simran I'm on my
// way". See components/VoiceAssistant.jsx for the listening and the talking;
// this file holds the switch, the name matching and the sending.
//
// What leaves the device: the browser's own speech service turns the voice into
// text (in Chrome that's Google's), and the sentence — including a dictated
// message — goes to /api/assistant/command to be understood. The contact list
// never does: names are matched here. The message itself is then encrypted and
// sent like any other.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api } from './client';
import { encryptMessage } from './e2ee';
import { conversationTitle, isGroup } from './conversations';

export function voiceSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Hands-free listening, per device. Off until someone switches it on.
const VOICE_KEY = 'ghosted:voice';
const listeners = new Set();

export function voiceOn() {
  try {
    return localStorage.getItem(VOICE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setVoice(on) {
  try {
    localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage is blocked: it can't be remembered, so it stays off
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceOn() {
  return useSyncExternalStore(subscribe, voiceOn, () => false);
}

// ---- Hearing ----

// "Hey Boo" — and what speech recognisers tend to make of it
const WAKE = /\b(?:hey|hi|hello|ok|okay)[\s,]+(?:boo[\s-]boo|boo+h?|bu+|bhu)\b[\s,.!?]*/i;

// The command that follows the wake words: '' when they were said alone,
// null when they weren't said at all
export function afterWakeWords(heard) {
  const match = heard.match(WAKE);
  return match ? heard.slice(match.index + match[0].length).trim() : null;
}

export const isYes = (heard) => /^(?:yes|yeah|yep|yup|ya|sure|ok|okay|send|send it|do it|go ahead|haan|ha|ji)\b/i.test(heard.trim());
export const isNo = (heard) => /^(?:no|nope|nah|cancel|stop|don'?t|never mind|nahi|nahin|mat)\b/i.test(heard.trim());

// ---- Finding who was meant ----

const simplify = (name) =>
  String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

// 1 = the same, 0 = nothing alike. Spelling slips ("harindar") still score high.
function likeness(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

const GOOD_ENOUGH = 0.72;
const TOO_CLOSE = 0.06; // two chats this close together: ask rather than guess

// The chat that was meant by a spoken name: { conversation } when it's clear,
// { several: [titles] } when two fit equally well, {} when nothing fits.
// A chat answers to its title (nickname or group name), the person's real
// name, and their first name.
export function findChat(conversations, spoken) {
  const whole = findByName(conversations, simplify(spoken));
  if (whole.conversation || whole.several) return whole;
  // Nothing answers to all of it ("my friend harinder", "harinder on video"):
  // see whether one of its words is somebody
  const words = simplify(spoken).split(' ').filter((word) => word.length >= 3);
  if (words.length < 2) return {};
  const hits = words.map((word) => findByName(conversations, word)).filter((hit) => hit.conversation);
  const chats = [...new Set(hits.map((hit) => hit.conversation))];
  if (chats.length === 1) return { conversation: chats[0] };
  if (chats.length > 1) return { several: chats.slice(0, 3).map(conversationTitle) };
  return {};
}

function findByName(conversations, wanted) {
  if (!wanted) return {};

  const scored = conversations
    .filter((c) => !c.isRequest)
    .map((conversation) => {
      const names = [conversationTitle(conversation), isGroup(conversation) ? '' : conversation.otherUser?.name].map(simplify).filter(Boolean);
      const answersTo = [...new Set([...names, ...names.map((n) => n.split(' ')[0])])];
      return { conversation, score: Math.max(0, ...answersTo.map((name) => likeness(wanted, name))) };
    })
    .filter((entry) => entry.score >= GOOD_ENOUGH)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return {};
  const close = scored.filter((entry) => scored[0].score - entry.score < TOO_CLOSE);
  if (close.length > 1) return { several: close.slice(0, 3).map((entry) => conversationTitle(entry.conversation)) };
  return { conversation: scored[0].conversation };
}

// ---- Doing ----

// Sends a message to a chat, encrypted for its members like any typed one.
// payload: what lib/e2ee.js encrypts — { text }, { text: '', sticker }, { text, gift }.
// The open chat (and the list) pick it up from the socket, as they would a
// message sent from another tab.
export const sendTextTo = (conversation, text) => sendTo(conversation, { text });

export async function sendTo(conversation, payload) {
  const conversationId = conversation._id;

  async function encryptAndSend(members) {
    const { encrypted } = await encryptMessage({ conversationId, members, payload });
    return api('/api/messages', { method: 'POST', body: { conversationId, ...encrypted } });
  }

  try {
    return (await encryptAndSend(conversation.participants || [])).message;
  } catch (err) {
    if (err.code !== 'KEYS_CHANGED') throw err;
    // Someone joined, left or got new keys since the list loaded: refresh and try once more
    const { conversation: fresh } = await api(`/api/conversations/${conversationId}`);
    return (await encryptAndSend(fresh.participants)).message;
  }
}

// ---- Asking a chat's screen to do something ----

// Opening the camera or starting a voice note belongs to the chat screen, which
// may not even be on screen yet when the assistant asks for it. So the request
// is left here, and the chat picks it up — at once if it's open, or as soon as
// it is. One that nobody collects is forgotten after a few seconds.
const ASK_LASTS_MS = 15 * 1000;
const askListeners = new Set();
let asked = null; // { conversationId, what, at }

// what: 'camera' | 'recorder'
export function askChat(conversationId, what) {
  asked = { conversationId, what, at: Date.now() };
  askListeners.forEach((listener) => listener());
}

// In the chat's own components: calls handle() when this chat is asked for `what`
export function useChatAsk(conversationId, what, handle) {
  const handler = useRef(handle);
  handler.current = handle;
  useEffect(() => {
    function check() {
      if (!asked || asked.conversationId !== conversationId || asked.what !== what) return;
      const fresh = Date.now() - asked.at < ASK_LASTS_MS;
      asked = null;
      if (fresh) handler.current();
    }
    check();
    askListeners.add(check);
    return () => askListeners.delete(check);
  }, [conversationId, what]);
}
