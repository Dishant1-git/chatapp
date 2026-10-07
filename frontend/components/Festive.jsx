'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const BULBS = 16;
const SNOWFLAKES = 18;
const GREETING_MS = 7000;
const FIRST_MOMENT_MS = 6000;
const MOMENT_EVERY_MS = 45 * 1000;
const MOMENT_LASTS_MS = 3200;

// 🪔 The app dressed up for a festival (lib/festivals.js decides which, and
// sets the colours): a string of lights across the top, a greeting once a day,
// a few petals or sparks drifting down, and every so often a small "moment" —
// dandiya sticks for Navratri, a firework for Diwali, a splash of colour for Holi.
// In December it snows instead (and globals.css puts red caps on Boo and the logo).
//
// All of it is decoration: drawn over the page (any page — it's mounted in the
// root layout), under the call screen, and taps go straight through. Nothing
// moves with "reduce motion" on — the lights just glow — and the moments wait
// while the tab is in the background.
export default function Festive({ festival }) {
  const reduceMotion = useReducedMotion();
  const [greeting, setGreeting] = useState('');
  const [moment, setMoment] = useState(0); // counts up: each number is one showing

  // The greeting, once a day
  useEffect(() => {
    const key = `ghosted:festive:greeted:${festival.id}`;
    const today = new Date().toDateString();
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch {
      // Storage is blocked: greeted every visit, which is no harm
    }
    setGreeting(festival.greeting);
    const timer = setTimeout(() => setGreeting(''), GREETING_MS);
    return () => clearTimeout(timer);
  }, [festival.id, festival.greeting]);

  const quiet = reduceMotion || !festival.moment;
  useEffect(() => {
    if (quiet) return;
    const show = () => !document.hidden && setMoment((n) => n + 1);
    const first = setTimeout(show, FIRST_MOMENT_MS);
    const timer = setInterval(show, MOMENT_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [quiet]);
  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(() => setMoment(0), MOMENT_LASTS_MS);
    return () => clearTimeout(timer);
  }, [moment]);

  const Moment = MOMENTS[festival.moment];

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      <Lights colours={festival.lights} />
      {!reduceMotion && <Drift things={festival.drift} count={festival.snow ? SNOWFLAKES : 6} />}

      <AnimatePresence>
        {greeting && (
          <motion.p
            key="greeting"
            initial={{ opacity: 0, x: -16, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -16 }}
            // The bottom-left corner. Anywhere along the middle it lands on
            // something: the logo and its red cap at the top of the login page,
            // the Log in button lower down, the chat's name in the app.
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full bg-panel px-4 py-1.5 text-sm font-medium text-fg shadow-lg"
          >
            {/* Navratri: the colour to wear today */}
            {festival.day && (
              <span className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ background: festival.day.colour.hex }} />
            )}
            {greeting}
          </motion.p>
        )}
        {moment > 0 && !quiet && Moment && <Moment key={moment} colours={festival.lights} />}
      </AnimatePresence>
    </div>
  );
}

// A wire of scallops across the top with a bulb hanging at the bottom of each.
// The glow and the twinkle are plain CSS (globals.css, "festive-bulb"), so the
// lights cost nothing while they hang there.
function Lights({ colours }) {
  const wire = useMemo(() => {
    const step = 100 / BULBS;
    let path = 'M0,1';
    for (let i = 0; i < BULBS; i++) path += ` Q${(i + 0.5) * step},13 ${(i + 1) * step},1`;
    return path;
  }, []);

  return (
    <div className="absolute inset-x-0 top-[env(safe-area-inset-top)] h-8">
      <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="absolute inset-0 h-3.5 w-full">
        <path d={wire} fill="none" stroke="var(--muted)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity="0.55" />
      </svg>
      {Array.from({ length: BULBS }, (_, i) => {
        const colour = colours[i % colours.length];
        return (
          <span
            key={i}
            className="festive-bulb absolute top-[7px] h-[15px] w-[10px] -translate-x-1/2 rounded-b-full rounded-t-[3px]"
            style={{
              left: `${((i + 0.5) * 100) / BULBS}%`,
              background: colour,
              color: colour, // the glow takes its colour from here (currentColor)
              animationDelay: `${(i % 5) * -0.55}s`,
            }}
          />
        );
      })}
    </div>
  );
}

// A handful of petals (or sparks, or flags) falling slowly, well apart
function Drift({ things, count }) {
  const falling = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        thing: things[i % things.length],
        left: 3 + ((i * 37) % 94), // spread out, and the same on every render
        duration: 13 + (i % 4) * 3,
        delay: i * (21 / count), // however many there are, they arrive over the same while
        sway: i % 2 ? 26 : -26,
      })),
    [things, count]
  );

  return falling.map((f, i) => (
    <motion.span
      key={i}
      className="absolute top-0 text-base opacity-70"
      style={{ left: `${f.left}%` }}
      initial={{ y: '-6vh', x: 0, rotate: 0, opacity: 0 }}
      animate={{ y: '106vh', x: [0, f.sway, 0, -f.sway, 0], rotate: 320, opacity: [0, 0.75, 0.75, 0.75, 0] }}
      transition={{ duration: f.duration, delay: f.delay, repeat: Infinity, repeatDelay: count > 6 ? 0 : 6, ease: 'linear' }}
    >
      {f.thing}
    </motion.span>
  ));
}

// ---- The moments ----

// 🥢 Navratri: two dandiya sticks swing in and clack together, twice
function Dandiya({ colours }) {
  const stick = (side) => (
    <motion.span
      className="absolute bottom-0 block h-24 w-2.5 origin-bottom rounded-full shadow-md"
      style={{
        [side]: '50%',
        background: `repeating-linear-gradient(45deg, ${colours[0]} 0 8px, ${colours[1] || '#facc15'} 8px 16px)`,
      }}
      initial={{ rotate: side === 'right' ? -70 : 70, opacity: 0 }}
      animate={{ rotate: (side === 'right' ? [-70, 24, -8, 24, -70] : [70, -24, 8, -24, 70]), opacity: [0, 1, 1, 1, 0] }}
      transition={{ duration: 2.6, times: [0, 0.3, 0.5, 0.7, 1], ease: 'easeInOut' }}
    />
  );
  return (
    <motion.div className="absolute top-[22%] left-1/2 h-24 w-24 -translate-x-1/2" exit={{ opacity: 0 }}>
      {stick('right')}
      {stick('left')}
      {/* The clack */}
      {[0.78, 1.82].map((at) => (
        <motion.span
          key={at}
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 0.45, delay: at }}
        >
          ✨
        </motion.span>
      ))}
    </motion.div>
  );
}

// 🎆 Diwali: a rocket goes up and bursts
function Firework({ colours }) {
  const left = useMemo(() => 20 + Math.random() * 60, []);
  const sparks = 14;
  return (
    <motion.div className="absolute top-[24%]" style={{ left: `${left}%` }} exit={{ opacity: 0 }}>
      <motion.span
        className="absolute h-10 w-0.5 rounded-full"
        style={{ background: colours[0] }}
        initial={{ y: '50vh', opacity: 0 }}
        animate={{ y: [null, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      {Array.from({ length: sparks }, (_, i) => {
        const angle = (i / sparks) * Math.PI * 2;
        const reach = 70 + (i % 3) * 22;
        return (
          <motion.span
            key={i}
            className="festive-bulb absolute h-1.5 w-1.5 rounded-full"
            style={{ background: colours[i % colours.length], color: colours[i % colours.length] }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: Math.cos(angle) * reach, y: Math.sin(angle) * reach + 26, opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1, 0.3] }}
            transition={{ duration: 1.6, delay: 0.85, ease: 'easeOut' }}
          />
        );
      })}
    </motion.div>
  );
}

// 🎨 Holi: a few handfuls of colour land and fade
function Splash({ colours }) {
  const blobs = useMemo(
    () => colours.slice(0, 4).map((colour, i) => ({ colour, left: 12 + Math.random() * 70, top: 16 + Math.random() * 50, size: 110 + Math.random() * 90, delay: i * 0.22 })),
    [colours]
  );
  return blobs.map((b, i) => (
    <motion.span
      key={i}
      className="absolute rounded-full blur-xl"
      style={{ left: `${b.left}%`, top: `${b.top}%`, width: b.size, height: b.size, background: b.colour }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.15, 1], opacity: [0, 0.4, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2.4, delay: b.delay, ease: 'easeOut' }}
    />
  ));
}

const MOMENTS = { dandiya: Dandiya, firework: Firework, splash: Splash };
