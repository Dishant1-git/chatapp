'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { MOODS, STYLES } from '@/lib/gifts';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// How long "hold" takes: the 🔐 secret style, and both people in "open together"
const HOLD_MS = 1200;
const TOGETHER_MS = 1200;
// "Open together" offers to open it alone after this long without them
const OPEN_ALONE_AFTER_MS = 15000;
// While held, the hold is repeated so the other side knows it's still real
const HOLD_REPEAT_MS = 1500;

// 🎁 Opening a gift message, full screen.
// First the style's own little game (unwrap, crack the ice, pop the balloons…),
// or — for "open together" — both people holding at once; then the message.
//
// together: { peerName, peerHolding, peerOnline, onHold(holding) } or null
// onOpened: called once the message is showing (the receiver marks it unwrapped)
export default function GiftReveal({ message, senderName, isMine, together, onOpened, onClose }) {
  const reduceMotion = useReducedMotion();
  const { mood, style } = message.gift;
  const moodInfo = MOODS[mood];
  const [phase, setPhase] = useState(reduceMotion && !together ? 'open' : 'intro'); // intro → open
  const openedOnce = useRef(false);
  // Decided once: if "together" goes away while we're still waiting, the other
  // person opened it (or chose to open it alone) — so it opens here too
  const [startedTogether] = useState(Boolean(together));

  useEscapeKey(onClose);

  const finish = useCallback(() => {
    navigator.vibrate?.(30);
    setPhase('open');
  }, []);

  useEffect(() => {
    if (startedTogether && !together && phase === 'intro') finish();
  }, [startedTogether, together, phase, finish]);

  useEffect(() => {
    if (phase !== 'open' || openedOnce.current) return;
    openedOnce.current = true;
    onOpened?.();
  }, [phase, onOpened]);

  const Stage = STAGES[style] || WrappedStage;
  const hint = together ? 'Hold together to open' : STYLES[style].hint;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black/75 p-4 backdrop-blur-sm select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${STYLES[style].label} gift from ${senderName}`}
      style={{ '--mood': moodInfo.color }}
    >
      {style === 'galaxy' && <Starfield warp={phase === 'open'} />}

      <button
        type="button"
        onClick={onClose}
        className="absolute top-[max(1rem,var(--safe-top,0px))] right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X size={22} />
      </button>

      <AnimatePresence mode="wait">
        {phase === 'intro' ? (
          <motion.div
            key="intro"
            className="relative flex flex-col items-center gap-6 text-center text-white"
            exit={{ opacity: 0, scale: 1.15, transition: { duration: 0.25 } }}
          >
            <div>
              <p className="text-sm text-white/70">
                {isMine ? 'Your gift' : `${senderName} sent you something`} {moodInfo.emoji}
              </p>
              <p className="mt-1 text-lg font-semibold">{hint}</p>
            </div>
            {startedTogether ? (
              <HoldTogether {...(together || {})} mood={moodInfo} styleEmoji={STYLES[style].emoji} onDone={finish} />
            ) : (
              <Stage mood={moodInfo} onDone={finish} reduceMotion={reduceMotion} />
            )}
          </motion.div>
        ) : (
          <OpenedGift
            key="open"
            message={message}
            senderName={senderName}
            style={style}
            mood={moodInfo}
            reduceMotion={reduceMotion}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---- The message, once it's open ----

function OpenedGift({ message, senderName, style, mood, reduceMotion }) {
  const text = message.text || '';
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const wordByWord = (style === 'magic' || style === 'galaxy') && !reduceMotion && words.length < 400;

  const body = wordByWord ? (
    words.map((word, i) => (
      <motion.span
        key={i}
        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ delay: 0.25 + i * 0.06, duration: 0.35 }}
      >
        {word}
      </motion.span>
    ))
  ) : (
    text
  );

  const card =
    style === 'letter' ? (
      <div className="rounded-sm bg-[#fdf6e7] px-6 py-7 text-[#3a2a1c] shadow-2xl [background-image:repeating-linear-gradient(transparent,transparent_27px,#ecdcc4_28px)]">
        <p className="font-serif text-[17px] leading-7 whitespace-pre-wrap italic">{body}</p>
        <p className="mt-4 text-right font-serif italic">— {senderName} {mood.emoji}</p>
      </div>
    ) : style === 'ticket' ? (
      <div className="flex overflow-hidden rounded-2xl bg-panel text-fg shadow-2xl">
        <div className="flex w-12 shrink-0 items-center justify-center bg-[var(--mood)] text-white">
          <span className="-rotate-90 text-xs font-bold tracking-[0.3em] whitespace-nowrap">ADMIT ONE</span>
        </div>
        <div className="min-w-0 flex-1 border-l-2 border-dashed border-line px-5 py-5">
          <p className="text-[11px] font-semibold tracking-widest text-muted uppercase">
            {mood.emoji} A {mood.label.toLowerCase()} from {senderName}
          </p>
          <p className="mt-2 text-[17px] leading-snug break-words whitespace-pre-wrap">{body}</p>
        </div>
      </div>
    ) : style === 'galaxy' ? (
      <div className="rounded-3xl border border-white/15 bg-white/5 px-6 py-6 text-white shadow-[0_0_60px_rgba(140,160,255,0.35)]">
        <p className="text-center text-[18px] leading-relaxed break-words whitespace-pre-wrap [text-shadow:0_0_12px_rgba(180,200,255,0.8)]">
          {body}
        </p>
        <p className="mt-4 text-center text-xs text-white/60">from {senderName} 🌌</p>
      </div>
    ) : (
      <div className="overflow-hidden rounded-3xl bg-panel text-fg shadow-2xl">
        <div className="flex items-center gap-2 bg-[var(--mood)] px-5 py-2.5 text-sm font-semibold text-white">
          <span className="text-lg">{STYLES[style].emoji}</span> {mood.emoji} {mood.label} · from {senderName}
        </div>
        <p className="px-5 py-5 text-[17px] leading-snug break-words whitespace-pre-wrap">{body}</p>
      </div>
    );

  return (
    <motion.div
      className="relative w-full max-w-md"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
    >
      {!reduceMotion && <Burst emojis={mood.particles} />}
      <div className="scroll-thin max-h-[70vh] overflow-y-auto">{card}</div>
    </motion.div>
  );
}

// Emojis flying out from the middle when the gift opens
function Burst({ emojis }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 140 + Math.random() * 120;
        return { id: i, emoji: emojis[i % emojis.length], x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      }),
    [emojis]
  );
  return particles.map((p) => (
    <motion.span
      key={p.id}
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 z-10 text-2xl"
      initial={{ x: 0, y: 0, scale: 0.3, opacity: 1 }}
      animate={{ x: p.x, y: p.y, scale: [0.3, 1.4, 1], opacity: [1, 1, 0] }}
      transition={{ duration: 1.1, ease: 'easeOut' }}
    >
      {p.emoji}
    </motion.span>
  ));
}

// ---- 💞 Open together ----

function HoldTogether({ peerName, peerHolding, peerOnline, onHold, onDone, mood, styleEmoji }) {
  const [holding, setHolding] = useState(false);
  const [canGoAlone, setCanGoAlone] = useState(!peerOnline);
  const both = holding && peerHolding;
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;

  useEffect(() => {
    if (!peerOnline) setCanGoAlone(true);
    const timer = setTimeout(() => setCanGoAlone(true), OPEN_ALONE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [peerOnline]);

  // Both holding for a moment → it opens, on both screens at once
  useEffect(() => {
    if (!both) return;
    navigator.vibrate?.(15);
    const timer = setTimeout(onDone, TOGETHER_MS);
    return () => clearTimeout(timer);
  }, [both, onDone]);

  const press = (value) => {
    setHolding(value);
    onHoldRef.current?.(value);
  };
  // Leaving (or opening) means I'm not holding any more
  useEffect(() => () => onHoldRef.current?.(false), []);
  // Keep saying so while the finger stays down (a hold that stops repeating runs out)
  useEffect(() => {
    if (!holding) return;
    const timer = setInterval(() => onHoldRef.current?.(true), HOLD_REPEAT_MS);
    return () => clearInterval(timer);
  }, [holding]);

  const status = both
    ? 'Opening… keep holding 💞'
    : holding
      ? `Waiting for ${peerName} to hold too…`
      : peerHolding
        ? `${peerName} is holding it — hold now!`
        : peerOnline
          ? `Hold the button, and ask ${peerName} to do the same`
          : `${peerName} isn't online right now`;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-6 text-xs text-white/80">
        <Presence label="You" active={holding} color={mood.color} />
        <span className="text-2xl">{both ? '💞' : '🤝'}</span>
        <Presence label={peerName} active={peerHolding} color={mood.color} />
      </div>

      <button
        type="button"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          press(true);
        }}
        onPointerUp={() => press(false)}
        onPointerCancel={() => press(false)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && press(true)}
        onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && press(false)}
        className="relative flex h-40 w-40 touch-none items-center justify-center rounded-full bg-white/10 text-7xl"
        aria-label="Hold to open together"
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
          <motion.circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${mood.color})` }}
            initial={false}
            animate={{ pathLength: both ? 1 : holding ? 0.5 : 0 }}
            transition={{ duration: both ? TOGETHER_MS / 1000 : 0.3, ease: 'linear' }}
          />
        </svg>
        <motion.span animate={{ scale: holding ? 0.9 : 1, rotate: both ? [0, -8, 8, -8, 0] : 0 }} transition={{ duration: 0.4, repeat: both ? Infinity : 0 }}>
          {styleEmoji}
        </motion.span>
      </button>

      <p className="min-h-5 text-sm text-white/80" aria-live="polite">{status}</p>

      {canGoAlone && !both && (
        <button type="button" onClick={onDone} className="text-xs text-white/60 underline underline-offset-2 hover:text-white">
          Can't wait? Open it alone
        </button>
      )}
    </div>
  );
}

function Presence({ label, active, color }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className="h-3 w-3 rounded-full transition-all"
        style={{ background: active ? '#fff' : 'rgba(255,255,255,0.25)', boxShadow: active ? `0 0 0 3px ${color}, 0 0 14px #fff` : 'none' }}
      />
      <span className="max-w-24 truncate">{label}</span>
    </span>
  );
}

// ---- The ten ways to open one ----

// 🎁 A box with a ribbon: tap and the lid flies off
function WrappedStage({ mood, onDone }) {
  const [opening, setOpening] = useState(false);
  const open = () => {
    if (opening) return;
    setOpening(true);
    setTimeout(onDone, 750);
  };
  return (
    <button type="button" onClick={open} className="relative h-44 w-44" aria-label="Unwrap the gift">
      <motion.span
        className="absolute inset-x-2 top-4 z-10 flex h-12 justify-center rounded-lg shadow-lg"
        style={{ background: mood.color, filter: 'brightness(1.1)' }}
        animate={opening ? { y: -160, rotate: -25, opacity: 0 } : { y: [0, -4, 0] }}
        transition={opening ? { duration: 0.6, ease: 'easeIn' } : { duration: 1.6, repeat: Infinity }}
      >
        <span className="h-full w-6 bg-white/80" />
        <span className="absolute -top-7 text-4xl">🎀</span>
      </motion.span>
      <motion.span
        className="absolute inset-x-4 top-14 bottom-0 flex justify-center rounded-b-xl shadow-xl"
        style={{ background: mood.color }}
        animate={opening ? { scale: [1, 1.08, 1] } : { rotate: [0, -2, 2, 0] }}
        transition={opening ? { duration: 0.4 } : { duration: 2.2, repeat: Infinity }}
      >
        <span className="h-full w-6 bg-white/80" />
      </motion.span>
    </button>
  );
}

// 💌 An envelope: the flap opens and the letter slides out
function LetterStage({ mood, onDone }) {
  const [opening, setOpening] = useState(false);
  const open = () => {
    if (opening) return;
    setOpening(true);
    setTimeout(onDone, 1000);
  };
  return (
    <button type="button" onClick={open} className="relative h-40 w-60 [perspective:600px]" aria-label="Open the letter">
      <motion.span
        className="absolute inset-x-4 top-3 bottom-3 rounded-sm bg-[#fdf6e7] shadow"
        animate={opening ? { y: -70 } : { y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      />
      <span className="absolute inset-0 rounded-md shadow-xl" style={{ background: mood.color }} />
      <span
        className="absolute inset-0 rounded-md"
        style={{ background: `linear-gradient(to top right, transparent 49.5%, rgba(0,0,0,0.12) 50%), linear-gradient(to top left, transparent 49.5%, rgba(0,0,0,0.12) 50%)` }}
      />
      <motion.span
        className="absolute inset-x-0 top-0 h-1/2 origin-top [transform-style:preserve-3d]"
        style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)', background: mood.color, filter: 'brightness(0.88)' }}
        animate={{ rotateX: opening ? 180 : 0 }}
        transition={{ duration: 0.45 }}
      />
      <motion.span
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl"
        animate={opening ? { scale: 0, opacity: 0 } : { scale: [1, 1.12, 1] }}
        transition={opening ? { duration: 0.2 } : { duration: 1.2, repeat: Infinity }}
      >
        ❤️
      </motion.span>
    </button>
  );
}

// 🧊 A block of ice: three taps crack it, the fourth shatters it
function FrozenStage({ onDone }) {
  const [hits, setHits] = useState(0);
  const cracks = [
    'M50 50 L20 10 M50 50 L85 25',
    'M50 50 L10 60 M50 50 L60 95',
    'M50 50 L90 70 M35 30 L5 25 M65 70 L80 95',
  ];
  const hit = () => {
    if (hits >= 3) return;
    navigator.vibrate?.(12);
    const next = hits + 1;
    setHits(next);
    if (next === 3) setTimeout(onDone, 650);
  };
  const shards = [...Array(8)].map((_, i) => ({ x: Math.cos((i / 8) * 6.28) * 180, y: Math.sin((i / 8) * 6.28) * 180 }));
  return (
    <button type="button" onClick={hit} className="relative h-44 w-44" aria-label={`Crack the ice (${hits} of 3)`}>
      {hits < 3 ? (
        <motion.span
          key={hits}
          className="absolute inset-0 overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-sky-100/80 via-cyan-200/60 to-sky-400/60 shadow-[inset_0_0_30px_rgba(255,255,255,0.8)] backdrop-blur-md"
          animate={{ x: hits ? [0, -6, 6, -3, 0] : 0 }}
          transition={{ duration: 0.25 }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-6xl opacity-60 blur-[2px]">🧊</span>
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            {cracks.slice(0, hits).map((d) => (
              <motion.path key={d} d={d} stroke="white" strokeWidth="1.6" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2 }} />
            ))}
          </svg>
        </motion.span>
      ) : (
        shards.map((s, i) => (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 h-10 w-8 bg-cyan-100/80"
            style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 80%)' }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: s.x, y: s.y, rotate: 200, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        ))
      )}
    </button>
  );
}

// 🔐 Hold to reveal: a ring fills while the finger stays down
function SecretStage({ mood, onDone }) {
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(timer);
  }, [holding, onDone]);
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setHolding(true);
      }}
      onPointerUp={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && setHolding(true)}
      onKeyUp={() => setHolding(false)}
      className="relative flex h-40 w-40 touch-none items-center justify-center rounded-full bg-white/10 text-6xl"
      aria-label="Hold to reveal"
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
        <motion.circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${mood.color})` }}
          initial={false}
          animate={{ pathLength: holding ? 1 : 0 }}
          transition={{ duration: holding ? HOLD_MS / 1000 : 0.25, ease: 'linear' }}
        />
      </svg>
      <motion.span animate={{ scale: holding ? 0.85 : 1, opacity: holding ? 0.7 : 1 }}>🔐</motion.span>
    </button>
  );
}

// 🎟️ A ticket: tap and the stub tears off
function TicketStage({ mood, onDone }) {
  const [torn, setTorn] = useState(false);
  const tear = () => {
    if (torn) return;
    setTorn(true);
    navigator.vibrate?.(20);
    setTimeout(onDone, 700);
  };
  return (
    <button type="button" onClick={tear} className="flex h-28 w-72 text-left" aria-label="Tear the ticket">
      <span className="flex flex-1 flex-col justify-center rounded-l-xl bg-[#fff7ea] px-4 text-[#3a2a1c] shadow-xl">
        <span className="text-[10px] font-bold tracking-[0.3em] opacity-60">ADMIT ONE</span>
        <span className="text-xl font-black">{mood.emoji} {mood.label.toUpperCase()}</span>
        <span className="text-[10px] tracking-widest opacity-60">ROW ❤ · SEAT YOU</span>
      </span>
      <motion.span
        className="flex w-20 origin-top-left items-center justify-center rounded-r-xl border-l-2 border-dashed border-[#3a2a1c]/30 text-3xl shadow-xl"
        style={{ background: mood.color }}
        animate={torn ? { rotate: 35, y: 200, x: 30, opacity: 0 } : { rotate: [0, 2, 0] }}
        transition={torn ? { duration: 0.6, ease: 'easeIn' } : { duration: 1.5, repeat: Infinity }}
      >
        🎟️
      </motion.span>
    </button>
  );
}

// 🌌 Stars, then a comet carries it in
function GalaxyStage({ onDone }) {
  const [launched, setLaunched] = useState(false);
  const launch = () => {
    if (launched) return;
    setLaunched(true);
    setTimeout(onDone, 900);
  };
  return (
    <button type="button" onClick={launch} className="relative h-44 w-44" aria-label="Launch">
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-7xl"
        animate={launched ? { x: 260, y: -260, scale: 0.3, opacity: 0 } : { y: [0, -8, 0], rotate: [0, 6, 0] }}
        transition={launched ? { duration: 0.8, ease: 'easeIn' } : { duration: 3, repeat: Infinity }}
      >
        🌠
      </motion.span>
    </button>
  );
}

function Starfield({ warp }) {
  const stars = useMemo(
    () => Array.from({ length: 70 }, (_, i) => ({ id: i, x: Math.random() * 100, y: Math.random() * 100, size: Math.random() * 2 + 1, delay: Math.random() * 3 })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,#1b1f4a_0%,#07081a_70%)]" aria-hidden>
      {stars.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
          animate={warp ? { scale: [1, 3, 1], opacity: [0.4, 1, 0.6] } : { opacity: [0.2, 1, 0.2] }}
          transition={{ duration: warp ? 0.8 : 2.5, delay: warp ? 0 : s.delay, repeat: warp ? 0 : Infinity }}
        />
      ))}
    </div>
  );
}

// 🎈 Pop every balloon
function BalloonStage({ onDone }) {
  const balloons = useMemo(
    () => ['🎈', '🎈', '🎈', '🎈', '🎈'].map((emoji, i) => ({ id: i, emoji, x: (i - 2) * 56, y: (i % 2) * 40, hue: i * 60 })),
    []
  );
  const [popped, setPopped] = useState([]);
  const pop = (id) => {
    if (popped.includes(id)) return;
    navigator.vibrate?.(10);
    const next = [...popped, id];
    setPopped(next);
    if (next.length === balloons.length) setTimeout(onDone, 450);
  };
  return (
    <div className="relative h-52 w-72">
      {balloons.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => pop(b.id)}
          className="absolute top-1/2 left-1/2 -mt-8 -ml-6 text-5xl"
          style={{ transform: `translate(${b.x}px, ${b.y - 20}px)`, filter: `hue-rotate(${b.hue}deg)` }}
          aria-label="Pop the balloon"
          disabled={popped.includes(b.id)}
        >
          <AnimatePresence>
            {popped.includes(b.id) ? (
              <motion.span key="pop" className="inline-block" initial={{ scale: 0.5 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.4 }}>
                💥
              </motion.span>
            ) : (
              <motion.span
                key="balloon"
                className="inline-block"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 1.4 + b.id * 0.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                {b.emoji}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      ))}
      <p className="absolute inset-x-0 bottom-0 text-xs text-white/60">
        {popped.length} / {balloons.length}
      </p>
    </div>
  );
}

// 🧩 Four pieces of one big emoji, each turned the wrong way. Tap to turn them.
function PuzzleStage({ mood, onDone }) {
  const [turns, setTurns] = useState(() => {
    const start = [1, 2, 3, 1].map((t) => (t + Math.floor(Math.random() * 3)) % 4);
    return start.every((t) => t === 0) ? [1, 0, 2, 3] : start;
  });
  const solved = turns.every((t) => t % 4 === 0);
  useEffect(() => {
    if (!solved) return;
    const timer = setTimeout(onDone, 600);
    return () => clearTimeout(timer);
  }, [solved, onDone]);

  const turn = (i) => !solved && setTurns((prev) => prev.map((t, j) => (j === i ? t + 1 : t)));
  const SIZE = 80;
  return (
    <div className="grid grid-cols-2 gap-1" style={{ width: SIZE * 2 + 4 }}>
      {turns.map((t, i) => (
        <motion.button
          key={i}
          type="button"
          onClick={() => turn(i)}
          className="relative overflow-hidden rounded-md bg-white/15"
          style={{ width: SIZE, height: SIZE }}
          animate={{ rotate: t * 90, scale: solved ? [1, 1.06, 1] : 1 }}
          // A spring can only go between two values, so the little "solved" bounce gets its own timing
          transition={{ rotate: { type: 'spring', stiffness: 300, damping: 20 }, scale: { duration: 0.4 } }}
          aria-label={`Turn piece ${i + 1} (${(t % 4) * 90}° off)`}
        >
          <span
            className="absolute flex items-center justify-center leading-none"
            style={{
              width: SIZE * 2,
              height: SIZE * 2,
              left: -(i % 2) * SIZE,
              top: -Math.floor(i / 2) * SIZE,
              fontSize: SIZE * 1.5,
            }}
          >
            {mood.emoji}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

// 🪄 A wand: tap it and sparkles fly, then the words appear one by one
function MagicStage({ onDone }) {
  const [casting, setCasting] = useState(false);
  const cast = () => {
    if (casting) return;
    setCasting(true);
    setTimeout(onDone, 800);
  };
  const sparkles = [...Array(10)].map((_, i) => ({ x: Math.cos(i * 0.63) * 110, y: Math.sin(i * 0.63) * 110 }));
  return (
    <button type="button" onClick={cast} className="relative flex h-44 w-44 items-center justify-center text-7xl" aria-label="Wave the wand">
      <motion.span
        animate={casting ? { rotate: [0, -40, 30, 0], scale: [1, 1.2, 1] } : { rotate: [0, 10, 0] }}
        transition={casting ? { duration: 0.6 } : { duration: 1.8, repeat: Infinity }}
      >
        🪄
      </motion.span>
      {casting &&
        sparkles.map((s, i) => (
          <motion.span
            key={i}
            className="absolute text-2xl"
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.3 }}
            animate={{ x: s.x, y: s.y, opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.7, delay: i * 0.02 }}
          >
            ✨
          </motion.span>
        ))}
    </button>
  );
}

// 📦 Box shakes → opens → POP!
function MysteryStage({ onDone }) {
  const [step, setStep] = useState('idle'); // idle → shaking → pop
  const open = () => {
    if (step !== 'idle') return;
    setStep('shaking');
    navigator.vibrate?.([20, 40, 20, 40, 20]);
    setTimeout(() => setStep('pop'), 900);
    setTimeout(onDone, 1300);
  };
  return (
    <button type="button" onClick={open} className="relative flex h-44 w-44 items-center justify-center" aria-label="Open the mystery box">
      {step === 'pop' ? (
        <motion.span className="text-6xl font-black text-white" initial={{ scale: 0.2 }} animate={{ scale: [0.2, 1.6, 1.3] }} transition={{ duration: 0.35 }}>
          POP!
        </motion.span>
      ) : (
        <motion.span
          className="text-8xl"
          animate={
            step === 'shaking'
              ? { rotate: [0, -14, 14, -14, 14, -8, 8, 0], x: [0, -6, 6, -6, 6, 0] }
              : { y: [0, -6, 0], rotate: [0, -3, 3, 0] }
          }
          transition={step === 'shaking' ? { duration: 0.9 } : { duration: 1.4, repeat: Infinity }}
        >
          📦
        </motion.span>
      )}
      {step === 'idle' && <span className="absolute -top-2 right-4 text-3xl">❓</span>}
    </button>
  );
}

const STAGES = {
  wrapped: WrappedStage,
  letter: LetterStage,
  frozen: FrozenStage,
  secret: SecretStage,
  ticket: TicketStage,
  galaxy: GalaxyStage,
  balloon: BalloonStage,
  puzzle: PuzzleStage,
  magic: MagicStage,
  mystery: MysteryStage,
};
