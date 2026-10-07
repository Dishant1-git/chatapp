'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { BooAvatar } from './Avatar';
import { api } from '@/lib/client';
import { nextRequestAt } from '@/lib/ghost';
import { BOO_NAME, BOO_PICTURES, booHasSeen, markBooSeen } from '@/lib/boo';

// 👻 Boo floating in a chat where I've been ghosted: a joke about it and, when
// there's still something I can send, a few messages to pick from. One sent
// this way tells the other person it was "Suggested by Boo", and Boo says so
// before it goes.
//
// Sits just above whatever is at the bottom of the chat (the ghost banner).
// Only shown while Boo's pop-ups are on — see useBooOn in lib/boo.js.
export default function BooBuddy({ conversationId, ghost, otherName, onSend }) {
  const reduceMotion = useReducedMotion();
  // Opens by itself the first time I see this ghosting, then waits to be tapped
  const [isOpen, setIsOpen] = useState(() => !booHasSeen(conversationId, ghost));
  const [said, setSaid] = useState(null); // { joke, suggestions }
  const [isLoading, setIsLoading] = useState(false);
  const [picked, setPicked] = useState(''); // the suggestion waiting for "send it"
  const asked = useRef(0);

  // What a suggestion would be sent as: an ordinary message while soft-ghosted,
  // the one forgiveness request while ghosted. Deeper than that only emojis get
  // through, so Boo sticks to jokes.
  const sendAs =
    ghost.level === 'soft'
      ? 'message'
      : ghost.level === 'ghosted' && !ghost.requestId && !nextRequestAt(ghost)
        ? 'forgive'
        : null;
  const canSend = Boolean(sendAs);

  async function load() {
    const mine = ++asked.current;
    setIsLoading(true);
    setPicked('');
    try {
      const data = await api('/api/boo/ghosted', { method: 'POST', body: { level: ghost.level, canSend } });
      if (mine === asked.current) setSaid(data);
    } catch (err) {
      if (mine === asked.current) setSaid({ joke: `I had a joke, then I dropped it 👻 (${err.message})`, suggestions: [] });
    } finally {
      if (mine === asked.current) setIsLoading(false);
    }
  }

  // Nothing is fetched until Boo is actually open
  useEffect(() => {
    if (!isOpen) return;
    markBooSeen(conversationId, ghost);
    if (!said && !isLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function send() {
    onSend(picked, { forgive: sendAs === 'forgive' });
    setPicked('');
    setSaid({ joke: 'Sent! Fingers crossed 🤞 …if I had fingers.', suggestions: [] });
  }

  const them = otherName?.split(' ')[0] || 'They';
  const suggestions = canSend ? said?.suggestions || [] : [];

  return (
    <div className="relative z-10 h-0 shrink-0">
      <div className="absolute bottom-2 left-3 max-w-[calc(100%-1.5rem)]">
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.div
              key="open"
              role="dialog"
              aria-label={`${BOO_NAME} has something to say`}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-80 max-w-full rounded-2xl border border-line bg-panel p-3 text-sm text-fg shadow-xl"
            >
              <div className="flex items-center gap-2">
                <BooAvatar size={30} picture={BOO_PICTURES.laugh} />
                <p className="min-w-0 flex-1 font-semibold">{BOO_NAME}</p>
                <button
                  type="button"
                  onClick={load}
                  disabled={isLoading}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg disabled:opacity-50"
                  aria-label="Another one"
                  title="Another one"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
                  aria-label={`Hide ${BOO_NAME}`}
                >
                  <X size={15} />
                </button>
              </div>

              {isLoading || !said ? (
                <p className="mt-2 flex items-center gap-2 text-muted">
                  <Loader2 size={14} className="animate-spin" /> Boo is thinking of something rude…
                </p>
              ) : (
                <p className="mt-2 leading-snug">{said.joke}</p>
              )}

              {!isLoading && suggestions.length > 0 && !picked && (
                <>
                  <p className="mt-3 text-xs font-medium text-muted">
                    {sendAs === 'forgive'
                      ? 'Fine, I’ll help. Your one forgiveness request could say:'
                      : 'Fine, I’ll help. You could send:'}
                  </p>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setPicked(suggestion)}
                        className="rounded-xl border border-line bg-panel-soft px-3 py-2 text-left leading-snug transition hover:bg-hover"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {picked && (
                <div className="mt-3">
                  <p className="rounded-xl bg-bubble-out px-3 py-2 leading-snug text-bubble-out-fg">{picked}</p>
                  <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    ⚠️ Heads up: {them} will see <strong>“👻 Suggested by Boo”</strong> under this message. No taking
                    credit for my work.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={send}
                      className="flex-1 rounded-full bg-brand py-2 font-medium text-on-brand hover:bg-brand-strong"
                    >
                      {sendAs === 'forgive' ? '🕊️ Send request' : 'Send it'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPicked('')}
                      className="flex-1 rounded-full border border-line py-2 font-medium hover:bg-hover"
                    >
                      Never mind
                    </button>
                  </div>
                </div>
              )}

              <p className="mt-3 text-[11px] text-muted">Too much? Switch me off in your profile.</p>
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              type="button"
              onClick={() => setIsOpen(true)}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, -5, 0] }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={reduceMotion ? { duration: 0.15 } : { y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }, duration: 0.15 }}
              className="block rounded-full shadow-lg"
              aria-label={`${BOO_NAME} has something to say`}
              title="Psst…"
            >
              <BooAvatar size={46} picture={BOO_PICTURES.peek} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
