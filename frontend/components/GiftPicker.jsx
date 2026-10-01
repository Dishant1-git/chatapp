'use client';

import { MOODS, STYLES } from '@/lib/gifts';

// 🎁 The Gift tab of the composer's emoji panel: pick a mood, and optionally a
// different way to open it and "open together". value: { mood, style, together } or null.
export default function GiftPicker({ value, onChange, canOpenTogether }) {
  const pickMood = (mood) =>
    onChange({
      mood,
      // A new mood brings its own reveal, unless one was picked on purpose
      style: value?.styleChosen ? value.style : MOODS[mood].style,
      styleChosen: value?.styleChosen || false,
      together: value?.together || false,
    });

  const pickStyle = (style) =>
    onChange({ mood: value?.mood || 'love', style, styleChosen: true, together: value?.together || false });

  // Buttons in here must not steal focus from the message box (keeps the phone keyboard up)
  const keepFocus = (e) => e.preventDefault();

  return (
    <div className="scroll-thin max-h-60 overflow-y-auto px-3 pb-1">
      <p className="pt-1 pb-1 text-[11px] font-semibold text-muted">Mood</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(MOODS).map(([key, mood]) => (
          <button
            key={key}
            type="button"
            onMouseDown={keepFocus}
            onClick={() => pickMood(key)}
            aria-pressed={value?.mood === key}
            className={`rounded-full border px-3 py-1 text-[13px] transition ${
              value?.mood === key ? 'border-transparent text-white' : 'border-line hover:bg-hover'
            }`}
            style={value?.mood === key ? { background: mood.color } : undefined}
          >
            {mood.emoji} {mood.label}
          </button>
        ))}
      </div>

      <p className="pt-2.5 pb-1 text-[11px] font-semibold text-muted">How it opens</p>
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
        {Object.entries(STYLES).map(([key, style]) => (
          <button
            key={key}
            type="button"
            onMouseDown={keepFocus}
            onClick={() => pickStyle(key)}
            aria-pressed={value?.style === key}
            title={style.hint}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition hover:bg-hover ${
              value?.style === key ? 'bg-brand-soft text-brand' : ''
            }`}
          >
            <span className="text-2xl">{style.emoji}</span>
            <span className="text-[10px] leading-tight">{style.label}</span>
          </button>
        ))}
      </div>

      {/* 💞 Both people hold at the same time and it opens on both screens */}
      {canOpenTogether && (
        <label className="mt-2 mb-1 flex cursor-pointer items-center gap-2.5 rounded-xl bg-panel-soft px-3 py-2 text-[13px]">
          <input
            type="checkbox"
            checked={Boolean(value?.together)}
            onMouseDown={keepFocus}
            onChange={(e) =>
              onChange({
                mood: value?.mood || 'love',
                style: value?.style || MOODS[value?.mood || 'love'].style,
                styleChosen: value?.styleChosen || false,
                together: e.target.checked,
              })
            }
            className="h-4 w-4 accent-[var(--brand)]"
          />
          <span>
            <span className="font-medium">💞 Open together</span>
            <span className="block text-[11px] text-muted">It only opens while you both hold it at the same time</span>
          </span>
        </label>
      )}
    </div>
  );
}
