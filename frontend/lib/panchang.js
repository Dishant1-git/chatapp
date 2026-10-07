// 🌙 Just enough of the Hindu lunar calendar to know, for any year, which day
// Navratri, Diwali or Holi falls on — so nobody has to type the dates in.
//
// A lunar day (tithi) is how far the Moon has pulled ahead of the Sun: every
// 12° of that angle is one tithi, 30 of them from one new moon to the next.
// A lunar month starts at a new moon and takes its name from the zodiac sign
// the Sun is in at that moment. With the Sun's and the Moon's positions, which
// are worked out below (Meeus, "Astronomical Algorithms", the larger terms —
// good to about a minute of arc), that's all a festival's date needs.
//
// The almanacs (panchang) add rules this doesn't know — which city's sunrise,
// an inauspicious hour to avoid — so once in a while a date here is a day off
// the published one. lib/festivals.js keeps a place to correct those by hand.

const RAD = Math.PI / 180;
const DAY_MS = 86400e3;
const IST_MS = 5.5 * 3600e3; // the calendar these festivals are kept by
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const norm = (degrees) => ((degrees % 360) + 360) % 360;
const sin = (degrees) => Math.sin(degrees * RAD);

// Julian centuries since 2000
const centuries = (ms) => (ms - J2000_MS) / DAY_MS / 36525;

function sunLongitude(ms) {
  const T = centuries(ms);
  const M = 357.52911 + 35999.05029 * T;
  const C = (1.914602 - 0.004817 * T) * sin(M) + 0.019993 * sin(2 * M) + 0.000289 * sin(3 * M);
  return norm(280.46646 + 36000.76983 * T + C - 0.00569 - 0.00478 * sin(125.04 - 1934.136 * T));
}

// [coefficient in millionths of a degree, D, M, M', F]
const MOON_TERMS = [
  [6288774, 0, 0, 1, 0], [1274027, 2, 0, -1, 0], [658314, 2, 0, 0, 0], [213618, 0, 0, 2, 0],
  [-185116, 0, 1, 0, 0], [-114332, 0, 0, 0, 2], [58793, 2, 0, -2, 0], [57066, 2, -1, -1, 0],
  [53322, 2, 0, 1, 0], [45758, 2, -1, 0, 0], [-40923, 0, 1, -1, 0], [-34720, 1, 0, 0, 0],
  [-30383, 0, 1, 1, 0], [15327, 2, 0, 0, -2], [-12528, 0, 0, 1, 2], [10980, 0, 0, 1, -2],
  [10675, 4, 0, -1, 0], [10034, 0, 0, 3, 0], [8548, 4, 0, -2, 0], [-7888, 2, 1, -1, 0],
  [-6766, 2, 1, 0, 0], [-5163, 1, 0, -1, 0], [4987, 1, 1, 0, 0], [4036, 2, -1, 1, 0],
];

function moonLongitude(ms) {
  const T = centuries(ms);
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T; // the Sun's terms fade as the Earth's orbit rounds out
  let sum = 0;
  for (const [coefficient, d, m, mp, f] of MOON_TERMS) {
    sum += coefficient * (m ? E : 1) * sin(d * D + m * M + mp * Mp + f * F);
  }
  return norm(218.3164477 + 481267.88123421 * T + sum / 1e6);
}

// How far the Moon is ahead of the Sun, 0–360°: 0 is new moon, 180 full
const elongation = (ms) => norm(moonLongitude(ms) - sunLongitude(ms));

// 1–30. 1–15 are the waxing fortnight (15 = full moon), 16–30 the waning (30 = new moon)
export const tithiAt = (ms) => Math.floor(elongation(ms) / 12) + 1;

// The instant the Moon is `angle` degrees ahead of the Sun, nearest to `ms`
function phaseNear(ms, angle) {
  let t = ms;
  for (let i = 0; i < 8; i++) {
    const off = ((elongation(t) - angle + 540) % 360) - 180; // −180 … 180
    t -= (off / 12.19) * DAY_MS; // the Moon gains about 12.19° a day
  }
  return t;
}

// Which zodiac sign (0 = Aries … 11 = Pisces) the Sun is in, as the Indian
// calendar counts it: against the stars, not the equinox (Lahiri ayanamsa)
function sunSign(ms) {
  const ayanamsa = 23.853 + 0.013969 * ((ms - J2000_MS) / DAY_MS / 365.25);
  return Math.floor(norm(sunLongitude(ms) - ayanamsa) / 30);
}

// The new moon that starts the lunar month named for `sign`, in a given year.
// When two new moons share a sign the first begins the extra (adhik) month
// nobody celebrates in, so the later one is taken.
function monthStart(year, sign) {
  let found = null;
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 20); t += 29.53 * DAY_MS) {
    const newMoon = phaseNear(t, 0);
    if (new Date(newMoon + IST_MS).getUTCFullYear() === year && sunSign(newMoon) === sign) found = newMoon;
  }
  return found;
}

// A calendar day in India, as [year, month (1–12), day]
const indianDay = (ms) => {
  const d = new Date(ms + IST_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
};
const atIndianHour = ([y, m, d], hour) => Date.UTC(y, m - 1, d) + hour * 3600e3 - IST_MS;

// The day in a lunar month on which a tithi is the one running at a given hour
// of the Indian day — which is how a festival's day is chosen: Diwali by the
// evening, Dussehra by the afternoon.
//   sign: the month (see monthStart). tithi: 1–30. hour: 0–24, Indian time.
// → [year, month, day], or null if that month doesn't fall in `year`
export function lunarDay(year, sign, tithi, hour) {
  const start = monthStart(year, sign);
  if (start === null) return null;
  const first = indianDay(start - DAY_MS);
  let closest = null;
  for (let i = 0; i < 33; i++) {
    const day = indianDay(atIndianHour(first, 12) + i * DAY_MS);
    const moment = atIndianHour(day, hour);
    if (moment < start) continue; // still the month before
    const running = tithiAt(moment);
    if (running === tithi) return day;
    // A short tithi can begin and end between two looks: the day it was skipped over
    if (closest === null && running > tithi && running - tithi < 15) closest = day;
  }
  return closest;
}

// The day of the full moon in a lunar month; one that comes after `cutoffHour`
// (Indian time) counts for the next day. Holi is kept this way.
export function fullMoonDay(year, sign, cutoffHour) {
  const start = monthStart(year, sign);
  if (start === null) return null;
  const fullMoon = phaseNear(start + 14.77 * DAY_MS, 180);
  const day = indianDay(fullMoon);
  const late = fullMoon > atIndianHour(day, cutoffHour);
  return late ? indianDay(fullMoon + DAY_MS) : day;
}

// 1 Shawwal — Eid al-Fitr — by the tabular Islamic calendar. The real day
// follows the sighting of the crescent and can be a day either side.
export function eidDay(year) {
  // The Islamic year whose tenth month begins in this Gregorian year
  for (let hijri = Math.floor((year - 622) * 1.0307) - 1; hijri < Math.floor((year - 622) * 1.0307) + 3; hijri++) {
    const julianDay = 1 + Math.ceil(29.5 * 9) + (hijri - 1) * 354 + Math.floor((3 + 11 * hijri) / 30) + 1948439.5 - 1;
    const date = new Date((julianDay - 2440587.5) * DAY_MS + DAY_MS / 2);
    if (date.getUTCFullYear() === year) return [year, date.getUTCMonth() + 1, date.getUTCDate()];
  }
  return null;
}

// The signs that name the months used in lib/festivals.js
export const MONTH = { magha: 9, phalguna: 10, chaitra: 11, shravana: 3, bhadrapada: 4, ashwin: 5, kartik: 6 };
