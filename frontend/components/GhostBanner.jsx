'use client';

import { Ghost, Loader2 } from 'lucide-react';
import { ghostStage } from '@/lib/ghost';

// Explains the ghost state to both people. The one who ghosted also gets an
// Unghost button and a link to the one message the other person sent.
export default function GhostBanner({ ghost, myId, otherName, isUnghosting, onUnghost, onJumpTo }) {
  const stage = ghostStage(ghost);
  if (!stage) return null;

  const byMe = ghost.by === myId;
  const text = byMe
    ? {
        pending: `You ghosted ${otherName}. They get one message, then emojis only.`,
        emojiOnly: `${otherName} used their one message. They can only send emojis until you unghost them.`,
      }[stage]
    : {
        pending: `${otherName} ghosted you. You get one message — make it count.`,
        emojiOnly: `${otherName} ghosted you. You can only send emojis until they unghost you.`,
      }[stage];

  return (
    <div className="shrink-0 border-t border-line bg-panel-soft px-3 py-2.5 md:px-4" role="status">
      <div className="flex items-center gap-2.5">
        <Ghost size={18} className="shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-sm">
          {text}
          {byMe && stage === 'emojiOnly' && ghost.messageId && (
            <button onClick={() => onJumpTo(ghost.messageId)} className="ml-1 font-medium text-brand hover:underline">
              Show message
            </button>
          )}
        </p>
        {byMe && (
          <button
            onClick={onUnghost}
            disabled={isUnghosting}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm font-medium transition hover:bg-hover disabled:opacity-50"
          >
            {isUnghosting && <Loader2 size={14} className="animate-spin" />}
            Unghost
          </button>
        )}
      </div>
    </div>
  );
}
