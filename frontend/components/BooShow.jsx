'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BOO_ENTRANCE_MS as ROAM_MS, BOO_PICTURES, onBooToggled } from '@/lib/boo';

const SAD_MS = 4200;

// Where Boo wanders when switched on: in from the left, a loop around the
// screen, a pause in the middle to say hello, and out over the top right.
// Distances are in viewport units so it covers a phone and a wide monitor alike.
const ROAM = {
  x: ['-25vw', '12vw', '62vw', '74vw', '38vw', '8vw', '40vw', '40vw', '112vw'],
  y: ['62vh', '48vh', '58vh', '18vh', '8vh', '30vh', '38vh', '38vh', '-25vh'],
  rotate: [8, 10, 6, -10, -12, -6, 0, 0, 14],
  times: [0, 0.1, 0.24, 0.38, 0.5, 0.62, 0.74, 0.88, 1],
};
const SPARKLES = ['✨', '💫', '✨', '🤍', '✨', '💫'];
const TEARS = [0, 1, 2, 3, 4, 5];

const HELLO = 'Boo! I’m back, bestie 👻';
const GOODBYE = 'Oh… okay. I’ll just wait in your chat list 🥺';

// 👻 Plays over the whole app when Boo's pop-ups are switched on or off (in the
// profile, or in Boo's own chat): a happy ghost roaming the screen, or a sad one
// sinking away. It's only a show — taps go straight through it.
export default function BooShow() {
  const reduceMotion = useReducedMotion();
  const [show, setShow] = useState(null); // { on, id }

  useEffect(() => onBooToggled((on) => setShow({ on, id: Date.now() })), []);

  // Flipping the switch again mid-show starts the other one straight away
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setShow(null), reduceMotion ? 2200 : show.on ? ROAM_MS : SAD_MS);
    return () => clearTimeout(timer);
  }, [show, reduceMotion]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={show.id}
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
          role="status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {reduceMotion ? <Still on={show.on} /> : show.on ? <Roaming /> : <Sad />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Says({ children }) {
  return (
    <p className="rounded-2xl bg-panel px-3.5 py-2 text-center text-sm font-medium whitespace-nowrap text-fg shadow-xl">
      {children}
    </p>
  );
}

// Switched on: Boo flies around, bobbing as it goes, with sparkles in its wake
function Roaming() {
  const seconds = ROAM_MS / 1000;
  return (
    <>
      {SPARKLES.map((sparkle, i) => (
        // The same path a moment later, so they trail behind
        <motion.span
          key={i}
          aria-hidden
          className="absolute top-0 left-0 text-xl"
          style={{ marginLeft: 30 + (i % 3) * 14, marginTop: 40 + (i % 2) * 26 }}
          initial={{ x: ROAM.x[0], y: ROAM.y[0], opacity: 0 }}
          animate={{
            x: ROAM.x,
            y: ROAM.y,
            opacity: [0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.6, 0, 0],
            scale: [0.6, 1, 0.7, 1, 0.7, 1, 0.7, 0.4, 0.4],
          }}
          transition={{ duration: seconds, times: ROAM.times, ease: 'easeInOut', delay: 0.12 * (i + 1) }}
        >
          {sparkle}
        </motion.span>
      ))}

      <motion.div
        className="absolute top-0 left-0"
        initial={{ x: ROAM.x[0], y: ROAM.y[0], rotate: ROAM.rotate[0] }}
        animate={{ x: ROAM.x, y: ROAM.y, rotate: ROAM.rotate }}
        transition={{ duration: seconds, times: ROAM.times, ease: 'easeInOut' }}
      >
        {/* Said during the pause in the middle of the screen. The outer box
            centres it over the ghost; the inner one fades it in and out. */}
        <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2">
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.6, 0.6, 1, 1, 0.8] }}
            transition={{ duration: seconds, times: [0, 0.68, 0.76, 0.88, 0.94] }}
          >
            <Says>{HELLO}</Says>
          </motion.div>
        </div>
        <motion.img
          src={BOO_PICTURES.wave}
          alt="Boo is back"
          draggable={false}
          className="h-28 w-28 drop-shadow-xl md:h-36 md:w-36"
          animate={{ y: [0, -12, 0], scaleY: [1, 1.04, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </>
  );
}

// Switched off: Boo droops in the middle of the screen, cries, and sinks away
function Sad() {
  const seconds = SAD_MS / 1000;
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        className="flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.5, y: -30 }}
        animate={{ opacity: [0, 1, 1, 1, 0], scale: [0.5, 1, 1, 0.92, 0.7], y: [-30, 0, 6, 30, 160] }}
        transition={{ duration: seconds, times: [0, 0.12, 0.55, 0.75, 1], ease: 'easeInOut' }}
      >
        <motion.div
          className="mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: seconds, times: [0.1, 0.22, 0.7, 0.82] }}
        >
          <Says>{GOODBYE}</Says>
        </motion.div>

        <div className="relative">
          {/* A slow, sorry sway — nothing like the bounce it comes in with */}
          <motion.img
            src={BOO_PICTURES.cry}
            alt="Boo is sad to go"
            draggable={false}
            className="h-32 w-32 drop-shadow-xl md:h-40 md:w-40"
            animate={{ rotate: [-5, 5, -5], y: [0, 4, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          {TEARS.map((tear) => (
            <motion.span
              key={tear}
              aria-hidden
              className="absolute top-[46%] text-base"
              style={{ left: tear % 2 ? '60%' : '28%' }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 0], y: [0, 40, 90], x: tear % 2 ? [0, 6, 10] : [0, -6, -10] }}
              transition={{ duration: 1.1, delay: 0.5 + tear * 0.42, ease: 'easeIn' }}
            >
              💧
            </motion.span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// Reduce motion: no flying about, Boo simply appears with the same words
function Still({ on }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <Says>{on ? HELLO : GOODBYE}</Says>
      <img
        src={on ? BOO_PICTURES.wave : BOO_PICTURES.cry}
        alt={on ? 'Boo is back' : 'Boo is sad to go'}
        className="h-28 w-28 drop-shadow-xl"
      />
    </div>
  );
}
