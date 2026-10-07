'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCalls } from './CallProvider';
import { FestiveCap } from './Logo';
import { shakeElement } from '@/lib/social';
import { BOO_ENTRANCE_MS, BOO_NAME, BOO_PICTURES, onBooToggled, useBooOn } from '@/lib/boo';

// 👻 While Boo is switched on, a small ghost drifts around the app and now and
// then gets up to something: buzzes the chat, pretends to write a message for
// you, plays peekaboo at the edge, flickers the lights.
//
// Every prank is make-believe. Nothing is typed into the real message box,
// nothing is sent, and nobody else sees or feels any of it — it's drawn on top
// of this screen only. Taps go through everything except the ghost itself.
//
// Not shown during a call, with "reduce motion" on, or while Boo's entrance
// (BooShow) is still playing.
export default function BooRoamer() {
  const on = useBooOn();
  const reduceMotion = useReducedMotion();
  const { currentCall } = useCalls();
  const [isEntering, setIsEntering] = useState(false);

  useEffect(() => {
    let timer;
    const stop = onBooToggled((nowOn) => {
      clearTimeout(timer);
      setIsEntering(nowOn);
      if (nowOn) timer = setTimeout(() => setIsEntering(false), BOO_ENTRANCE_MS);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, []);

  if (!on || reduceMotion || currentCall || isEntering) return null;
  return <Roamer />;
}

const SIZE = 44; // px
const TAP_LINES = ['Can’t catch me! 😜', 'Hey! That tickles 👻', 'Hands off the sheet!', 'Boo to you too 😏', 'Eek! 🫣'];
// What Boo pretends to write for you. Never sent, never put in the real box.
const FAKE_DRAFTS = ['heyyy… u up? 👀', 'i miss u (don’t tell anyone)', 'ok but who ghosted who first 🤔', 'boo says hi 👻', 'so… about last time 😬'];

const random = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Somewhere to hover: clear of the header at the top and of the message box
function randomSpot() {
  return {
    x: random(8, Math.max(8, window.innerWidth - SIZE - 8)),
    y: random(window.innerHeight * 0.12, window.innerHeight * 0.62),
  };
}

function Roamer() {
  const [spot, setSpot] = useState(randomSpot);
  const [travel, setTravel] = useState(0); // seconds the current move takes
  const [says, setSays] = useState('');
  const [picture, setPicture] = useState(BOO_PICTURES.wave);
  const [draft, setDraft] = useState(null); // the pretend message: { left, top, text }
  const [isFlickering, setIsFlickering] = useState(false);
  const tapTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    const timers = [];
    // Never resolves once Boo is gone, which is what ends the loop below
    const wait = (ms) => new Promise((resolve) => timers.push(setTimeout(resolve, ms)));
    const go = (to, seconds) => {
      setTravel(seconds);
      setSpot(to);
      return wait(seconds * 1000);
    };
    const calm = () => {
      setSays('');
      setPicture(BOO_PICTURES.wave);
    };

    async function wander() {
      await go(randomSpot(), random(4, 7));
      await wait(random(2000, 5000));
    }

    // 📳 Shakes the chat like a real buzz — but only here, nobody was buzzed
    async function buzz() {
      await go({ x: window.innerWidth / 2 - SIZE / 2, y: window.innerHeight * 0.4 }, 1.6);
      setPicture(BOO_PICTURES.laugh);
      setSays('Bzzzt! 📳');
      shakeElement(document.querySelector('main'));
      navigator.vibrate?.([80, 40, 80]);
      await wait(1800);
      setSays('Hehe. Wasn’t me 😇');
      await wait(1800);
      calm();
    }

    // ✍️ Hovers over the message box and "writes" something, then thinks better of it
    async function pretendToWrite() {
      const box = document.querySelector('main textarea');
      if (!box) return peekaboo();
      const rect = box.getBoundingClientRect();
      await go({ x: Math.max(8, rect.left + 12), y: Math.max(8, rect.top - 118) }, 1.8);

      const words = pick(FAKE_DRAFTS);
      const at = { left: Math.max(8, rect.left), top: rect.top - 62 };
      for (let i = 1; i <= words.length; i++) {
        setDraft({ ...at, text: words.slice(0, i) });
        await wait(70);
      }
      await wait(700);
      setPicture(BOO_PICTURES.laugh);
      setSays('Should I send it? 😈');
      await wait(1900);
      for (let i = words.length - 1; i >= 0; i--) {
        setDraft({ ...at, text: words.slice(0, i) });
        await wait(25);
      }
      setDraft(null);
      setSays('Relax, I’d never. …Probably.');
      await wait(2000);
      calm();
    }

    // 🫣 Slips off the edge of the screen, then pokes back in
    async function peekaboo() {
      const edge = window.innerWidth;
      const y = random(window.innerHeight * 0.2, window.innerHeight * 0.55);
      await go({ x: edge + 10, y }, 1.4);
      setPicture(BOO_PICTURES.peek);
      await wait(900);
      await go({ x: edge - SIZE * 0.7, y }, 0.35);
      setSays('Boo!');
      await wait(1600);
      calm();
    }

    // 💡 The lights go funny for a second
    async function flicker() {
      setSays('Watch this…');
      await wait(1000);
      setIsFlickering(true);
      await wait(1000);
      setIsFlickering(false);
      setPicture(BOO_PICTURES.laugh);
      setSays('Spooky, right? 👻');
      await wait(1700);
      calm();
    }

    const pranks = [buzz, pretendToWrite, peekaboo, flicker];

    async function haunt() {
      await wait(1200);
      let wandersLeft = 2;
      while (alive) {
        // Nobody's watching: save the mischief for when they are
        if (document.hidden) await wait(3000);
        else if (wandersLeft-- > 0) await wander();
        else {
          await pick(pranks)();
          wandersLeft = 3 + Math.floor(Math.random() * 3);
        }
      }
    }
    haunt();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      clearTimeout(tapTimer.current);
    };
  }, []);

  // Poked: Boo squeals and darts off
  function handleTap() {
    setPicture(BOO_PICTURES.laugh);
    setSays(pick(TAP_LINES));
    setTravel(0.45);
    setSpot(randomSpot());
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      setSays('');
      setPicture(BOO_PICTURES.wave);
    }, 1800);
  }

  // The speech bubble goes on whichever side has room for it
  const onRightHalf = typeof window !== 'undefined' && spot.x > window.innerWidth / 2;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {isFlickering && (
          <motion.div
            key="flicker"
            aria-hidden
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0.05, 0.3, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
          />
        )}
        {draft && (
          <motion.div
            key="draft"
            className="absolute max-w-[min(18rem,calc(100vw-1rem))] rounded-2xl rounded-bl-md border border-dashed border-brand/50 bg-panel px-3 py-1.5 shadow-lg"
            style={{ left: draft.left, top: draft.top }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
          >
            <p className="text-[10px] font-medium text-brand">👻 {BOO_NAME} is pretending to type…</p>
            <p className="text-sm text-fg">
              {draft.text}
              <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-fg align-middle" />
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="absolute top-0 left-0"
        initial={{ x: spot.x, y: spot.y, opacity: 0 }}
        animate={{ x: spot.x, y: spot.y, opacity: 1 }}
        transition={{ duration: travel, ease: 'easeInOut', opacity: { duration: 0.4 } }}
      >
        <AnimatePresence>
          {says && (
            <motion.p
              key={says}
              role="status"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              className={`absolute top-1/2 -translate-y-1/2 rounded-2xl bg-panel px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg shadow-xl ${
                onRightHalf ? 'right-full mr-1.5' : 'left-full ml-1.5'
              }`}
            >
              {says}
            </motion.p>
          )}
        </AnimatePresence>
        <motion.button
          type="button"
          onClick={handleTap}
          className="pointer-events-auto relative block cursor-pointer opacity-90"
          style={{ width: SIZE, height: SIZE }}
          animate={{ y: [0, -6, 0], rotate: [-4, 4, -4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          aria-label={`${BOO_NAME}, floating about. Tap to poke.`}
        >
          <img src={picture} alt="" draggable={false} className="h-full w-full drop-shadow-lg" />
          <FestiveCap />
        </motion.button>
      </motion.div>
    </div>
  );
}
