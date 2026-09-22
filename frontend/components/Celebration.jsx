'use client';

import { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// A short full-chat moment: emojis float up with a title, then it fades by itself.
// Used for "✨ You're unghosted", "👻 Still ghosted", "🕊️ You forgave them".
export default function Celebration({ emojis, title, subtitle, onClose, duration = 3800 }) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        emoji: emojis[i % emojis.length],
        left: Math.random() * 100,
        size: 18 + Math.random() * 22,
        delay: Math.random() * 1.2,
        duration: 2.6 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 100,
      })),
    [emojis]
  );

  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="status"
    >
      {!reduceMotion &&
        particles.map((p) => (
          <motion.span
            key={p.id}
            className="pointer-events-none absolute bottom-0 select-none"
            style={{ left: `${p.left}%`, fontSize: p.size }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: '-110vh', x: p.drift, opacity: [0, 1, 1, 0] }}
            transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
          >
            {p.emoji}
          </motion.span>
        ))}
      <motion.div
        className="rounded-3xl border border-line bg-panel/95 px-6 py-4 text-center shadow-2xl"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
      >
        <p className="text-xl font-semibold">{title}</p>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </motion.div>
    </motion.div>
  );
}
