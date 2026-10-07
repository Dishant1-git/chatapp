// 🪔 Festivals. Around an Indian festival the app dresses up by itself: its
// colours change (the palettes are in app/globals.css, under "Festivals"), a
// string of lights hangs across the top, and something small moves now and
// then (components/Festive.jsx). In December it snows and Boo and the logo
// wear a red cap.
//
// Nothing here needs touching from one year to the next. Every festival says
// how its day is found — a date, or a rule of the lunar calendar that
// lib/panchang.js works out — and when to start and stop dressing up around it.
// To add one, add an entry to FESTIVALS; to fix a day the calculation gets
// wrong (it can be a day off the almanac), add it to CORRECTIONS.
//
// It's a per-device setting (Profile → Festive look), on until switched off.
// To see one on any day, open any page with ?festival=navratri (or diwali,
// christmas …) in the address — /login?festival=navratri works; ?festival=off
// goes back to the calendar.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { MONTH, eidDay, fullMoonDay, lunarDay } from './panchang';

const HOUR_MS = 3600e3;
const DAY_MS = 24 * HOUR_MS;

// Navratri: each of the nine nights has its goddess and its colour to wear.
// The colour follows the day of the week (Sunday orange … Saturday grey), and
// the two weekdays that come round twice take peacock green and pink.
const GODDESSES = ['Shailputri', 'Brahmacharini', 'Chandraghanta', 'Kushmanda', 'Skandamata', 'Katyayani', 'Kalaratri', 'Mahagauri', 'Siddhidatri'];
const WEEKDAY_COLOURS = [
  { name: 'Orange', hex: '#f97316' },
  { name: 'White', hex: '#f8fafc' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Royal blue', hex: '#1d4ed8' },
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Grey', hex: '#9ca3af' },
];
const EXTRA_COLOURS = [
  { name: 'Peacock green', hex: '#0f766e' },
  { name: 'Pink', hex: '#ec4899' },
];

// One entry per festival:
//   day(year)  the festival's own day that year, as [year, month, day]
//   from       when the dressing-up starts, in hours from that day's midnight:
//              0 = as the day begins, -12 = noon the day before, -48 = two days ahead
//   days       how many days it lasts, counted from that same midnight
//   palette    which set of colours in globals.css
//   lights     the bulbs.  drift: what floats down.  moment: the little animation
//   snow       a lot more drifting.  hat: what Boo and the logo wear
// When two overlap, the one that started later is the one showing — which is
// how Dussehra takes over from the ninth night of Navratri at noon.
const FESTIVALS = [
  { id: 'lohri', name: 'Lohri', greeting: 'Happy Lohri! 🔥', day: (y) => [y, 1, 13], from: 0, days: 2, palette: 'saffron', moment: 'firework', lights: ['#f97316', '#facc15', '#dc2626', '#fb923c'], drift: ['🔥', '✨', '🪁'] },
  { id: 'republic', name: 'Republic Day', greeting: 'Happy Republic Day! 🇮🇳', day: (y) => [y, 1, 26], from: 0, days: 1, palette: 'tricolor', moment: null, lights: ['#ff9933', '#ffffff', '#138808'], drift: ['🇮🇳'] },
  // The evening before is Holika Dahan
  { id: 'holi', name: 'Holi', greeting: 'Happy Holi! Bura na mano 🎨', day: (y) => fullMoonDay(y, MONTH.phalguna, 16.75), from: -24, days: 1, palette: 'colours', moment: 'splash', lights: ['#ec4899', '#22d3ee', '#facc15', '#a855f7', '#22c55e'], drift: ['🎨', '💜', '💛', '💚', '💗'] },
  { id: 'eid', name: 'Eid', greeting: 'Eid Mubarak! 🌙', day: eidDay, from: -6, days: 2, palette: 'emerald', moment: null, lights: ['#facc15', '#34d399', '#fde68a', '#10b981'], drift: ['🌙', '⭐', '✨'] },
  { id: 'baisakhi', name: 'Baisakhi', greeting: 'Happy Baisakhi! 🌾', day: (y) => [y, 4, 13], from: 0, days: 2, palette: 'saffron', moment: 'dandiya', lights: ['#facc15', '#f97316', '#16a34a', '#fb923c'], drift: ['🌾', '🌼'] },
  { id: 'rakhi', name: 'Raksha Bandhan', greeting: 'Happy Raksha Bandhan! 🎀', day: (y) => lunarDay(y, MONTH.shravana, 15, 7), from: 0, days: 1, palette: 'colours', moment: null, lights: ['#ec4899', '#facc15', '#f97316', '#a855f7'], drift: ['🎀', '✨', '🌸'] },
  { id: 'independence', name: 'Independence Day', greeting: 'Happy Independence Day! 🇮🇳', day: (y) => [y, 8, 15], from: 0, days: 1, palette: 'tricolor', moment: 'firework', lights: ['#ff9933', '#ffffff', '#138808'], drift: ['🇮🇳'] },
  { id: 'janmashtami', name: 'Janmashtami', greeting: 'Happy Janmashtami! 🦚', day: (y) => lunarDay(y, MONTH.shravana, 23, 24), from: 0, days: 1, palette: 'gold', moment: null, lights: ['#1d4ed8', '#facc15', '#0f766e', '#fde68a'], drift: ['🦚', '🪈', '✨'] },
  { id: 'ganesh', name: 'Ganesh Chaturthi', greeting: 'Ganpati Bappa Morya! 🙏', day: (y) => lunarDay(y, MONTH.bhadrapada, 4, 12), from: 0, days: 2, palette: 'saffron', moment: null, lights: ['#f97316', '#dc2626', '#facc15', '#16a34a'], drift: ['🌺', '🌼', '✨'] },
  // From the stroke of midnight before the first night, for nine days
  { id: 'navratri', name: 'Navratri', greeting: 'Happy Navratri! 🙏', day: (y) => lunarDay(y, MONTH.ashwin, 1, 10), from: 0, days: 9, palette: 'saffron', moment: 'dandiya', lights: ['#facc15', '#dc2626', '#16a34a', '#ec4899', '#f97316'], drift: ['🌼', '🌺', '✨'] },
  // From noon the day before
  { id: 'dussehra', name: 'Dussehra', greeting: 'Happy Dussehra! 🏹', day: (y) => lunarDay(y, MONTH.ashwin, 10, 13.5), from: -12, days: 1, palette: 'saffron', moment: 'firework', lights: ['#f97316', '#facc15', '#dc2626'], drift: ['🏹', '🌼', '✨'] },
  // A week before to four days after: in 2026, with Diwali on the 8th, that's 1–12 November
  { id: 'diwali', name: 'Diwali', greeting: 'Happy Diwali! 🪔', day: (y) => lunarDay(y, MONTH.ashwin, 30, 18.5), from: -7 * 24, days: 5, palette: 'gold', moment: 'firework', lights: ['#facc15', '#f97316', '#ec4899', '#a855f7', '#fde68a'], drift: ['🪔', '✨', '🎇'] },
  { id: 'gurpurab', name: 'Gurpurab', greeting: 'Happy Gurpurab! 🙏', day: (y) => lunarDay(y, MONTH.kartik, 15, 12), from: 0, days: 1, palette: 'gold', moment: null, lights: ['#facc15', '#f97316', '#1d4ed8', '#fde68a'], drift: ['🪔', '✨'] },
  // All of December: snow, and red caps
  { id: 'christmas', name: 'Christmas', greeting: 'Merry Christmas! 🎄', day: (y) => [y, 12, 1], from: 0, days: 31, palette: 'winter', moment: null, snow: true, hat: 'santa', lights: ['#ef4444', '#22c55e', '#f8fafc', '#facc15'], drift: ['❄️', '❄', '✦'] },
  // From noon on the 31st through New Year's Day
  { id: 'newyear', name: 'New Year', greeting: 'Happy New Year! 🎉', day: (y) => [y, 12, 31], from: 12, days: 2, palette: 'gold', moment: 'firework', snow: true, hat: 'santa', lights: ['#facc15', '#f8fafc', '#a855f7', '#fde68a'], drift: ['🎉', '✨', '❄️'] },
];

// Where the calculation and the almanac disagree: '<id>-<year>': [year, month, day]
const CORRECTIONS = {
  // 'diwali-2024': [2024, 11, 1],
};

// When each festival starts and ends in a year, on the clock of whoever is looking
const yearCache = new Map();
function scheduleFor(year) {
  if (!yearCache.has(year)) {
    yearCache.set(
      year,
      FESTIVALS.flatMap((festival) => {
        const day = CORRECTIONS[`${festival.id}-${year}`] || festival.day(year);
        if (!day) return [];
        const midnight = new Date(day[0], day[1] - 1, day[2]).getTime();
        return [{ festival, midnight, start: midnight + festival.from * HOUR_MS, end: midnight + festival.days * DAY_MS }];
      })
    );
  }
  return yearCache.get(year);
}

// What's said about a festival at one moment. Navratri gets its night, goddess and colour.
function describe({ festival, midnight }, now) {
  if (festival.id === 'christmas') {
    const date = new Date(now).getDate();
    if (date < 24 || date > 26) return { ...festival, day: null, greeting: 'It’s December! ❄️' };
  }
  if (festival.id !== 'navratri') return { ...festival, day: null };

  const night = Math.min(8, Math.max(0, Math.floor((now - midnight) / DAY_MS))); // 0 … 8
  const weekdayOf = (n) => new Date(midnight + n * DAY_MS + 12 * HOUR_MS).getDay();
  const before = Array.from({ length: night }, (_, n) => weekdayOf(n));
  const weekday = weekdayOf(night);
  // A weekday that's already had its colour this Navratri takes one of the extra two
  const repeats = before.filter((d, i) => before.indexOf(d) !== i).length;
  const colour = before.includes(weekday) ? EXTRA_COLOURS[repeats % EXTRA_COLOURS.length] : WEEKDAY_COLOURS[weekday];
  return {
    ...festival,
    day: { number: night + 1, goddess: GODDESSES[night], colour },
    greeting: `Navratri, day ${night + 1} · Maa ${GODDESSES[night]} · ${colour.name}`,
    // Today's colour leads the string of lights
    lights: [colour.hex, ...festival.lights.filter((hex) => hex !== colour.hex)],
  };
}

// The festival showing at `now` (or null), and when that next changes
export function festivalAt(now = Date.now()) {
  const year = new Date(now).getFullYear();
  // Last year's too: New Year's Day belongs to the festival that began in December
  const all = [...scheduleFor(year - 1), ...scheduleFor(year), ...scheduleFor(year + 1)];
  const showing = all.filter((s) => s.start <= now && now < s.end).sort((a, b) => b.start - a.start)[0] || null;

  const changes = all.flatMap((s) => [s.start, s.end]).filter((t) => t > now);
  // Navratri changes its colour every midnight
  if (showing?.festival.id === 'navratri') changes.push(new Date(now).setHours(24, 0, 0, 0));
  return { festival: showing ? describe(showing, now) : null, changesAt: Math.min(...changes) };
}

// ---- The switch ----

const FESTIVE_KEY = 'ghosted:festive';
const listeners = new Set();

export function festiveOn() {
  try {
    return localStorage.getItem(FESTIVE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setFestive(on) {
  try {
    localStorage.setItem(FESTIVE_KEY, on ? 'on' : 'off');
  } catch {
    // Private browsing can block storage — it stays as it was
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFestiveOn() {
  return useSyncExternalStore(subscribe, festiveOn, () => true);
}

// ?festival=navratri: try one on, on any day. Remembered for the tab, so it's
// still there after logging in; ?festival=off (or closing the tab) ends it.
const PREVIEW_KEY = 'ghosted:festive:preview';
function preview() {
  try {
    const asked = new URLSearchParams(window.location.search).get('festival');
    if (asked) sessionStorage.setItem(PREVIEW_KEY, asked);
    const trying = sessionStorage.getItem(PREVIEW_KEY);
    return FESTIVALS.find((festival) => festival.id === trying) || null;
  } catch {
    return null;
  }
}

const LONGEST_WAIT_MS = 6 * HOUR_MS; // a timer much longer than this isn't to be trusted

// The festival to dress up for right now (or null). It changes on the minute
// it's meant to, with the app open. The colours and the hat come with it: they
// go on <html> as data-festival and data-hat, where globals.css picks them up.
export function useFestival() {
  const on = useFestiveOn();
  const [festival, setFestival] = useState(null);

  useEffect(() => {
    if (!on) return setFestival(null);
    let timer;
    function look() {
      const now = Date.now();
      const tryOn = preview();
      // A previewed festival is shown as if today were its (first) day
      const { festival: showing, changesAt } = tryOn
        ? { festival: describe({ festival: tryOn, midnight: new Date().setHours(0, 0, 0, 0) }, now), changesAt: now + LONGEST_WAIT_MS }
        : festivalAt(now);
      setFestival(showing);
      timer = setTimeout(look, Math.min(LONGEST_WAIT_MS, Math.max(1000, changesAt - now + 500)));
    }
    look();
    return () => clearTimeout(timer);
  }, [on]);

  const palette = festival?.palette || '';
  const hat = festival?.hat || '';
  useEffect(() => {
    const root = document.documentElement;
    if (palette) root.dataset.festival = palette;
    if (hat) root.dataset.hat = hat;
    return () => {
      delete root.dataset.festival;
      delete root.dataset.hat;
    };
  }, [palette, hat]);

  return festival;
}
