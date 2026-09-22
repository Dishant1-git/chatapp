'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useChat } from './ChatProvider';

// A short guided tour shown the first time someone uses the app on this device.
// Each step can point at a part of the screen (found by the labels the buttons
// already have). If that part isn't on screen — e.g. chat buttons when no chat
// is open — the step is shown as a card in the middle instead.

const STEPS = [
  {
    title: '👋 Welcome to Ghosted',
    text: 'A private chat app with end-to-end encryption, groups, calls — and a few playful twists. Here’s a quick tour of where everything is.',
  },
  {
    target: 'button[aria-label="New chat"]',
    title: '💬 Start a chat',
    text: 'Find anyone by name or email and start a one-to-one chat.',
  },
  {
    target: 'button[aria-label="New group"]',
    title: '👥 Create a group',
    text: 'Pick people, give the group a name and a photo. Admins can add or remove members and rename it.',
  },
  {
    target: 'input[placeholder="Search chats"]',
    title: '🔎 Find a conversation',
    text: 'Search your chats by name. Unread chats show a badge, and 🪦 marks a chat that’s been quiet for 30 days — you can revive it.',
  },
  {
    target: '[title="Your profile"], button[aria-label="Your profile"]',
    title: '🎭 Your profile',
    text: 'Change your photo and name, set a mood (🧠 overthinking, 🗣️ yap mode…) that friends see next to your name, and check your private “social life” stats.',
  },
  {
    target: '[title="Dark mode"], [title="Light mode"]',
    title: '🌙 Light or dark',
    text: 'Switch the look whenever you like.',
  },
  {
    target: 'button[aria-label="Tell them you miss them"]',
    title: '❤️ Miss you',
    text: 'Tap the heart to tell someone you miss them. They get floating hearts and a nudge to send you something sweet.',
    fallback: 'Open any one-to-one chat and you’ll find the ❤️ button at the top.',
  },
  {
    target: 'button[aria-label="Video call"]',
    title: '📞 Voice & video calls',
    text: 'Call anyone — or a group of up to 6. Calls are encrypted too. You can mute, turn the camera off or minimize the call and keep chatting.',
    fallback: 'You’ll find the call buttons at the top of every chat.',
  },
  {
    target: 'button[aria-label="Chat options"]',
    title: '⋮ The chat menu',
    text: 'Mute a chat, 👻 ghost someone (soft, ghosted, deep or permanent — they can ask for forgiveness), 🧠 read the vibe, add 🧩 inside jokes, or 🚪 leave without drama.',
    fallback: 'Every chat has a ⋮ menu at the top right.',
  },
  {
    title: '💡 Little extras',
    text: 'Long-press (or right-click) a message to reply, react — even 🫣 anonymously — or delete it. Opened a chat by accident? 👀 Undo seen. Keep talking to grow a 🔥 connection streak.',
  },
  {
    title: '🔒 Private by design',
    text: 'Your messages and photos are end-to-end encrypted. Your PIN never leaves your device — not even Ghosted can read your chats. You’re all set!',
  },
];

const CARD_MARGIN = 16;
const GAP = 14; // space between the highlighted part and the card

function storageKey(userId) {
  return `ghosted:tour-done:${userId}`;
}

// The first matching element that is actually visible on screen
function findTarget(selector) {
  if (!selector) return null;
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && el.offsetParent !== null) return el;
  }
  return null;
}

export default function Tour() {
  const { user } = useChat();
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null); // highlighted part of the screen, or null
  const [layout, setLayout] = useState(null); // where the card and its arrow go
  const cardRef = useRef(null);

  // First time on this device for this account?
  useEffect(() => {
    if (!user?._id) return;
    let done = false;
    try {
      done = localStorage.getItem(storageKey(user._id)) === '1';
    } catch {
      // Storage blocked (e.g. private mode): show it, it just won't be remembered
    }
    if (!done) {
      // Give the chat list a moment to appear first
      const timer = setTimeout(() => setIsOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [user?._id]);

  const finish = useCallback(() => {
    setIsOpen(false);
    try {
      localStorage.setItem(storageKey(user._id), '1');
    } catch {
      // Nothing to do
    }
  }, [user?._id]);

  const lastIndex = STEPS.length - 1;
  const step = STEPS[Math.min(index, lastIndex)];
  const isLast = index >= lastIndex;
  // Read the current step from a ref so fast double-clicks can't skip past the end
  const indexRef = useRef(0);
  indexRef.current = index;
  const next = useCallback(() => {
    if (indexRef.current >= lastIndex) finish();
    else setIndex(Math.min(indexRef.current + 1, lastIndex));
  }, [lastIndex, finish]);
  const back = useCallback(() => setIndex(Math.max(0, indexRef.current - 1)), []);

  // Find the part of the screen this step talks about, and keep following it
  useLayoutEffect(() => {
    if (!isOpen) return;
    function measure() {
      const el = findTarget(step.target);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    findTarget(step.target)?.scrollIntoView?.({ block: 'nearest' });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, step]);

  // Place the card below the highlighted part (or above if there's no room),
  // with the arrow pointing at its middle
  useLayoutEffect(() => {
    if (!isOpen || !cardRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const card = cardRef.current.getBoundingClientRect();
    if (!rect) {
      setLayout({ centered: true });
      return;
    }
    const below = rect.top + rect.height + GAP;
    const placeBelow = below + card.height <= vh - CARD_MARGIN || rect.top - GAP - card.height < CARD_MARGIN;
    const top = placeBelow ? below : rect.top - GAP - card.height;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centerX - card.width / 2, CARD_MARGIN), vw - card.width - CARD_MARGIN);
    const arrowX = Math.min(Math.max(centerX - left, 20), card.width - 20);
    setLayout({ centered: false, top, left, arrowX, placeBelow });
  }, [isOpen, rect, index]);

  // Keyboard: → next, ← back, Esc skip
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event) {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') back();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, next, back, finish]);

  if (!isOpen) return null;

  const pad = 6;
  const text = rect || !step.fallback ? step.text : `${step.text} ${step.fallback}`;
  const cardStyle = layout && !layout.centered ? { top: layout.top, left: layout.left } : undefined;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Ghosted tour">
      {/* The dim background, with a hole around the highlighted part */}
      {rect ? (
        <motion.div
          className="pointer-events-none fixed rounded-2xl"
          initial={false}
          animate={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
          transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
          style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)' }}
        >
          {!reduceMotion && (
            <motion.span
              className="absolute inset-0 rounded-2xl border-2 border-white"
              animate={{ opacity: [0.9, 0.2, 0.9], scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          )}
        </motion.div>
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          ref={cardRef}
          initial={{ opacity: 0, y: layout?.placeBelow === false ? -8 : 8 }}
          animate={{ opacity: layout ? 1 : 0, y: 0 }}
          exit={{ opacity: 0, pointerEvents: 'none' }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          style={cardStyle}
          className={`fixed w-[min(340px,calc(100vw-32px))] rounded-2xl border border-line bg-panel p-5 shadow-2xl ${
            !layout || layout.centered ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : ''
          }`}
        >
          {/* The arrow pointing at the highlighted part */}
          {layout && !layout.centered && (
            <span
              className={`absolute h-4 w-4 rotate-45 border-line bg-panel ${
                layout.placeBelow ? '-top-2 border-t border-l' : '-bottom-2 border-r border-b'
              }`}
              style={{ left: layout.arrowX - 8 }}
            />
          )}

          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold">{step.title}</h3>
            <button
              onClick={finish}
              className="-mt-1 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover"
              aria-label="Close tour"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>

          {/* Progress dots */}
          <div className="mt-3 flex gap-1" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-brand' : 'w-1.5 bg-line'}`}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 whitespace-nowrap">
            {!isLast ? (
              <button onClick={finish} className="-ml-2 rounded-full px-2 py-1.5 text-sm text-muted hover:bg-hover">
                Skip tutorial
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1.5">
              {index > 0 && (
                <button onClick={back} className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-hover">
                  Back
                </button>
              )}
              <button
                onClick={next}
                autoFocus
                className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-strong"
              >
                {isLast ? 'Get started' : 'Next feature'}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
