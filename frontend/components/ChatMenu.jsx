'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, BellOff, Brain, DoorOpen, EllipsisVertical, Ghost, Puzzle } from 'lucide-react';
import { useChat } from './ChatProvider';
import { api } from '@/lib/client';
import { GHOST_LEVEL_INFO } from '@/lib/ghost';

// The ⋮ menu in the chat header. Mute works here; the rest opens a dialog
// owned by ChatWindow (onOpen('ghost' | 'vibe' | 'badge' | 'leave')).
export default function ChatMenu({ conversation, myId, onError, onOpen }) {
  const { updateConversation } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const { _id: conversationId, isMuted, ghost, otherUser } = conversation;
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

  async function setMuted(muted) {
    setIsOpen(false);
    try {
      const data = await api(`/api/conversations/${conversationId}/mute`, { method: 'POST', body: { muted } });
      updateConversation(conversationId, { isMuted: data.isMuted });
    } catch (err) {
      onError(err.message);
    }
  }

  function open(dialog) {
    setIsOpen(false);
    onOpen(dialog);
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
          className="absolute top-full right-0 z-30 mt-1 w-64 origin-top-right overflow-hidden rounded-2xl border border-line bg-panel py-1 text-sm shadow-xl"
        >
          {isMuted ? (
            <MenuItem icon={Bell} label="Unmute" onClick={() => setMuted(false)} />
          ) : (
            <MenuItem icon={BellOff} label="Mute" onClick={() => setMuted(true)} />
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
          <MenuItem icon={Brain} label="Read the vibe" onClick={() => open('vibe')} />
          <MenuItem icon={Puzzle} label="Add inside joke" onClick={() => open('badge')} />
          {isDirect && <MenuItem icon={DoorOpen} label="Leave conversation" onClick={() => open('leave')} />}
        </motion.div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, hint, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <Icon size={17} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}
