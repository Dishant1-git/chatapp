'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, DoorOpen, EllipsisVertical, Eraser, Ghost, Heart, Image, Puzzle, Vibrate } from 'lucide-react';
import { GHOST_LEVEL_INFO } from '@/lib/ghost';

// The ⋮ menu in the chat header. 💕 Miss you and 📳 buzz work here; the rest
// opens a dialog owned by ChatWindow (onOpen('ghost' | 'vibe' | 'badge' | 'leave' | 'clear')).
// Mute, Trusted Ghosts and Delete chat are in the chat list's right-click menu.
export default function ChatMenu({ conversation, myId, onOpen, onMissYou, onBuzz, isBusy }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const { ghost, otherUser } = conversation;
  const isDirect = conversation.type !== 'group';
  const ghostedByMe = ghost?.by === myId;
  const ghostedByThem = Boolean(ghost) && !ghostedByMe;

  // Close the menu when tapping anywhere else
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  function open(dialog) {
    setIsOpen(false);
    onOpen(dialog);
  }

  function run(action) {
    setIsOpen(false);
    action();
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
        aria-label="Chat options"
        aria-expanded={isOpen}
      >
        <EllipsisVertical size={20} />
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12 }}
          className="scroll-thin absolute top-full right-0 z-30 mt-1 max-h-[calc(var(--app-height,100dvh)-6rem)] w-64 origin-top-right overflow-y-auto rounded-2xl border border-line bg-panel py-1 text-sm shadow-xl"
        >
          {isDirect && onMissYou && (
            <MenuItem
              icon={Heart}
              label="💕 Miss you"
              hint="They see floating hearts"
              disabled={isBusy}
              onClick={() => run(onMissYou)}
            />
          )}
          {isDirect && onBuzz && (
            <MenuItem
              icon={Vibrate}
              label="📳 Buzz their phone"
              hint="Vibrates and shakes their chat"
              disabled={isBusy}
              onClick={() => run(onBuzz)}
            />
          )}
          {isDirect && otherUser && (
            <MenuItem
              icon={Ghost}
              label={ghostedByMe ? `${GHOST_LEVEL_INFO[ghost.level]?.emoji} Ghost settings` : 'Ghost mode'}
              hint={ghostedByThem ? `${otherUser.name} is ghosting you` : ''}
              disabled={ghostedByThem}
              onClick={() => open('ghost')}
            />
          )}
          <MenuItem
            icon={Image}
            label="🖼️ Chat background"
            hint="Just for this chat, on this device"
            onClick={() => open('background')}
          />
          <MenuItem icon={Brain} label="Read the vibe" onClick={() => open('vibe')} />
          <MenuItem icon={Puzzle} label="Add inside joke" onClick={() => open('badge')} />
          {isDirect && <MenuItem icon={DoorOpen} label="Leave conversation" onClick={() => open('leave')} />}
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Eraser} label="Clear chat" hint="Only for you" onClick={() => open('clear')} />
        </motion.div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, hint, disabled, danger, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover disabled:opacity-50 disabled:hover:bg-transparent ${
        danger ? 'text-red-600 dark:text-red-400' : ''
      }`}
    >
      <Icon size={17} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}
