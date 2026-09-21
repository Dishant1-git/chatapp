'use client';

import { useEffect, useState } from 'react';
import { Ghost, Loader2 } from 'lucide-react';
import { ghostStage } from '@/lib/ghost';

// "12:34" until the given time
function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);

  if (!until) return '';
  const seconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Explains the ghost state to both people. For the ghoster it also shows the
// Ghost / Forgive buttons once the other person has sent their one message.
// asFooter: shown in place of the message input (the ghosted person can't type)
export default function GhostBanner({ ghost, myId, otherName, isDeciding, onDecide, onJumpTo, asFooter = false }) {
  const stage = ghostStage(ghost);
  const countdown = useCountdown(stage === 'emojiOnly' ? ghost.emojiUntil : null);
  if (!stage) return null;

  const byMe = ghost.by === myId;
  const text = byMe
    ? {
        pending: `You ghosted ${otherName}. They get one message to change your mind.`,
        awaiting: `${otherName} sent their one message. Ghost them or give them another chance?`,
        emojiOnly: `${otherName} can only send emojis. Fully ghosted in ${countdown}.`,
        full: `${otherName} is fully ghosted.`,
      }[stage]
    : {
        pending: `${otherName} ghosted you. You get one message — make it count.`,
        awaiting: `Your one message is in. Waiting for ${otherName} to decide…`,
        emojiOnly: `${otherName} ghosted you. Emojis only for ${countdown}.`,
        full: `${otherName} ghosted you. You can't send messages here anymore.`,
      }[stage];

  const showVerdict = byMe && stage === 'awaiting';

  return (
    <div
      className={`shrink-0 border-t border-line bg-panel-soft px-3 py-2.5 md:px-4 ${
        asFooter ? 'pb-[max(0.625rem,env(safe-area-inset-bottom))]' : ''
      }`}
      role="status"
    >
      <div className="flex items-center gap-2.5">
        <Ghost size={18} className="shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-sm">
          {text}
          {showVerdict && ghost.messageId && (
            <button onClick={() => onJumpTo(ghost.messageId)} className="ml-1 font-medium text-brand hover:underline">
              Show message
            </button>
          )}
        </p>
      </div>

      {showVerdict && (
        <div className="mt-2 flex justify-end gap-2">
          {isDeciding && <Loader2 size={18} className="mr-1 animate-spin self-center text-muted" />}
          <button
            onClick={() => onDecide(false)}
            disabled={isDeciding}
            className="rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-medium transition hover:bg-hover disabled:opacity-50"
          >
            Forgive
          </button>
          <button
            onClick={() => onDecide(true)}
            disabled={isDeciding}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            Ghost
          </button>
        </div>
      )}
    </div>
  );
}
