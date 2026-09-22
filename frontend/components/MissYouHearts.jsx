'use client';

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, PenLine, X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const HEART_COUNT = 28;
const SWEET_REPLIES = ['Miss you too ❤️', 'Thinking of you 🥰', "Can't wait to see you 😘", 'Sending you a big hug 🤗'];
const HEART_COLORS = ['#f43f5e', '#ec4899', '#fb7185', '#e11d48', '#f472b6'];

// Shown when someone says they miss you: hearts float up the screen and a
// card suggests a sweet reply.
export default function MissYouHearts({ name, onReply, onWriteOwn, onClose }) {
  const reduceMotion = useReducedMotion();
  useEscapeKey(onClose);

  // Random but stable for this overlay: where each heart starts, its size and speed
  const hearts = useMemo(
    () =>
      Array.from({ length: HEART_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 16 + Math.random() * 26,
        delay: Math.random() * 1.6,
        duration: 3 + Math.random() * 2.5,
        drift: (Math.random() - 0.5) * 120,
        color: HEART_COLORS[i % HEART_COLORS.length],
      })),
    []
  );

  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-black/10 p-4 backdrop-blur-[1px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {!reduceMotion &&
        hearts.map((heart) => (
          <motion.span
            key={heart.id}
            className="pointer-events-none absolute bottom-0"
            style={{ left: `${heart.left}%`, color: heart.color }}
            initial={{ y: 40, x: 0, opacity: 0, scale: 0.6 }}
            animate={{ y: '-110vh', x: heart.drift, opacity: [0, 1, 1, 0], scale: [0.6, 1, 1.1, 0.9] }}
            transition={{ duration: heart.duration, delay: heart.delay, ease: 'easeOut' }}
          >
            <Heart size={heart.size} fill="currentColor" strokeWidth={0} />
          </motion.span>
        ))}

      <motion.div
        role="dialog"
        aria-label={`${name} is missing you`}
        className="relative w-full max-w-sm rounded-3xl border border-line bg-panel p-6 text-center shadow-2xl"
        initial={{ scale: 0.85, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover"
          aria-label="Close"
        >
          <X size={17} />
        </button>

        <motion.div
          className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 text-rose-500"
          animate={reduceMotion ? undefined : { scale: [1, 1.15, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Heart size={32} fill="currentColor" strokeWidth={0} />
        </motion.div>

        <h3 className="text-lg font-semibold">{name} is missing you a lot 💕</h3>
        <p className="mt-1 text-sm text-muted">Send them a sweet message</p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SWEET_REPLIES.map((reply) => (
            <button
              key={reply}
              onClick={() => onReply(reply)}
              className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-sm transition hover:bg-rose-500/20"
            >
              {reply}
            </button>
          ))}
        </div>

        <button
          onClick={onWriteOwn}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <PenLine size={15} /> Write your own
        </button>
      </motion.div>
    </motion.div>
  );
}
