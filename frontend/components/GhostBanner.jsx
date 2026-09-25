'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { GHOST_LEVEL_INFO, nextRequestAt } from '@/lib/ghost';

// Explains the ghost to both people.
// - The one ghosting: the level, and buttons to change it or unghost.
// - The one ghosted: what they can still do, and (unless it's permanent) a way
//   to send one forgiveness request — then a 24-hour cooldown.
// asFooter: shown in place of the message input (they can't type at this level)
export default function GhostBanner({ ghost, myId, otherName, isUnghosting, onUnghost, onChangeLevel, onRequest, asFooter }) {
  const [isWriting, setIsWriting] = useState(false);
  const [text, setText] = useState('');
  if (!ghost) return null;

  const info = GHOST_LEVEL_INFO[ghost.level] || GHOST_LEVEL_INFO.ghosted;
  const byMe = ghost.by === myId;
  const waitUntil = nextRequestAt(ghost);
  // Soft and regular ghosts can ask for forgiveness; deep and permanent can't
  const canRequest = !byMe && ['soft', 'ghosted'].includes(ghost.level) && !ghost.requestId && !waitUntil;

  const description = byMe
    ? {
        soft: `You soft-ghosted ${otherName}. Their messages come in quietly.`,
        ghosted: `You ghosted ${otherName}. They can send emojis, and one forgiveness request.`,
        deep: `You deep-ghosted ${otherName}. Emojis and reactions only.`,
        permanent: `You permanently ghosted ${otherName}. The chat is locked for them.`,
      }[ghost.level]
    : {
        soft: `${otherName} soft-ghosted you. Your messages still go through — quietly.`,
        ghosted: `${otherName} ghosted you. Emojis only — and you get one forgiveness request.`,
        deep: `${otherName} deep-ghosted you. Emojis and reactions only.`,
        permanent: `${otherName} permanently ghosted you. This chat is locked.`,
      }[ghost.level];

  async function send(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onRequest(trimmed);
    setText('');
    setIsWriting(false);
  }

  return (
    <div
      className={`shrink-0 border-t border-line bg-panel-soft px-3 py-2.5 md:px-4 ${asFooter ? 'pb-[max(0.625rem,var(--safe-bottom))]' : ''}`}
      role="status"
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-lg" aria-hidden>
          {info.emoji}
        </span>
        <p className="min-w-0 flex-1 text-sm">
          {description}
          {!byMe && ghost.requestId && <span className="text-muted"> Your request is waiting for an answer…</span>}
          {!byMe && !ghost.requestId && waitUntil && (
            <span className="text-muted">
              {' '}
              You can ask again {new Date(waitUntil).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.
            </span>
          )}
        </p>
        {byMe && (
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={onChangeLevel}
              className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-medium transition hover:bg-hover"
            >
              Level
            </button>
            <button
              onClick={onUnghost}
              disabled={isUnghosting}
              className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-medium transition hover:bg-hover disabled:opacity-50"
            >
              {isUnghosting && <Loader2 size={14} className="animate-spin" />}
              Unghost
            </button>
          </div>
        )}
        {canRequest && !isWriting && (
          <button
            onClick={() => setIsWriting(true)}
            className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-sm font-medium text-on-brand transition hover:bg-brand-strong"
          >
            🕊️ Ask forgiveness
          </button>
        )}
      </div>

      {isWriting && (
        <form onSubmit={send} className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="I know I disappeared. My bad."
            className="min-w-0 flex-1 rounded-full bg-panel px-4 py-2 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/25 md:text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand disabled:opacity-40"
            aria-label="Send forgiveness request"
          >
            <Send size={17} />
          </button>
        </form>
      )}
      {isWriting && <p className="mt-1 pl-1 text-xs text-muted">One request at a time, and 24 hours between requests — make it count.</p>}
    </div>
  );
}

