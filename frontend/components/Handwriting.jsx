'use client';

// ✍️ Writes a short phrase out, one word after another, in the handwriting font.
// Each word is uncovered from left to right (the CSS is in globals.css), with a
// small nib travelling along the stroke, so it reads as being written by hand.
//
// text: what to write · speed: milliseconds per character · gap: pause between words
export default function Handwriting({
  text,
  className = '',
  speed = 105,
  gap = 180,
  startDelay = 0,
  showNib = true,
  ariaLabel,
}) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);

  // Each word takes as long as it has letters, and the next one starts after it
  let at = startDelay;
  const timed = words.map((word) => {
    const duration = Math.max(320, word.length * speed);
    const start = at;
    at += duration + gap;
    return { word, duration, start };
  });

  return (
    <span
      className={`font-hand inline-flex flex-wrap items-baseline justify-center gap-x-[0.3em] leading-[1.35] ${className}`}
      // Screen readers get the words at once; the writing is decoration
      aria-label={ariaLabel || text}
      role="img"
    >
      {timed.map(({ word, duration, start }, i) => (
        <span key={`${word}-${i}`} className="relative inline-block" aria-hidden>
          <span
            className="handwriting-word inline-block"
            style={{ '--write-duration': `${duration}ms`, '--write-delay': `${start}ms` }}
          >
            {word}
          </span>
          {showNib && (
            <span
              className="handwriting-nib pointer-events-none absolute top-[15%] bottom-[15%] w-[2px] rounded-full bg-current opacity-0"
              style={{ '--write-duration': `${duration}ms`, '--write-delay': `${start}ms` }}
            />
          )}
        </span>
      ))}
    </span>
  );
}

// How long the whole phrase takes, so a screen can wait for it to finish
export function handwritingDuration(text, { speed = 105, gap = 180, startDelay = 0 } = {}) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((total, word) => total + Math.max(320, word.length * speed) + gap, startDelay);
}
