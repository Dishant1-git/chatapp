'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, BellOff, EllipsisVertical, Ghost } from 'lucide-react';
import { useChat } from './ChatProvider';
import { api } from '@/lib/client';

// The ⋮ menu in the chat header: Mute / Unmute and Ghost / Unghost
export default function ChatMenu({ conversation, myId, onError }) {
  const { updateConversation } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const { _id: conversationId, isMuted, ghost, otherUser } = conversation;
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

  async function run(request, changes) {
    setIsOpen(false);
    try {
      const data = await request();
      updateConversation(conversationId, changes(data));
    } catch (err) {
      onError(err.message);
    }
  }

  function setMuted(muted) {
    run(
      () => api(`/api/conversations/${conversationId}/mute`, { method: 'POST', body: { muted } }),
      (data) => ({ isMuted: data.isMuted })
    );
  }

  function toggleGhost() {
    run(
      () => api(`/api/conversations/${conversationId}/ghost`, { method: ghostedByMe ? 'DELETE' : 'POST' }),
      (data) => ({ ghost: data.ghost })
    );
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
          className="absolute top-full right-0 z-30 mt-1 w-60 origin-top-right overflow-hidden rounded-2xl border border-line bg-panel py-1 text-sm shadow-xl"
        >
          {isMuted ? (
            <MenuItem icon={Bell} label="Unmute" onClick={() => setMuted(false)} />
          ) : (
            <MenuItem icon={BellOff} label="Mute" onClick={() => setMuted(true)} />
          )}
          <MenuItem
            icon={Ghost}
            label={ghostedByMe ? `Unghost ${otherUser.name}` : 'Ghosted'}
            hint={ghostedByThem ? `${otherUser.name} is ghosting you` : ''}
            disabled={ghostedByThem}
            onClick={toggleGhost}
          />
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
