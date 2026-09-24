'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Ban,
  Bell,
  BellOff,
  Brain,
  DoorOpen,
  EllipsisVertical,
  Eraser,
  Ghost,
  Heart,
  Image,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Vibrate,
} from 'lucide-react';
import { useChat } from './ChatProvider';
import { api } from '@/lib/client';
import { GHOST_LEVEL_INFO } from '@/lib/ghost';

// The ⋮ menu in the chat header. Mute, 💕 miss you, 📳 buzz and unblock work here;
// the rest opens a dialog owned by ChatWindow
// (onOpen('ghost' | 'vibe' | 'badge' | 'leave' | 'nickname' | 'clear' | 'deleteChat' | 'block')).
export default function ChatMenu({ conversation, myId, onError, onOpen, onMissYou, onBuzz, onUnblock, isBusy }) {
  const { updateConversation, user, toggleTrusted } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const { _id: conversationId, isMuted, ghost, otherUser, blockedByMe } = conversation;
  const isDirect = conversation.type !== 'group';
  const ghostedByMe = ghost?.by === myId;
  const ghostedByThem = Boolean(ghost) && !ghostedByMe;
  const isTrusted = Boolean(otherUser && (user?.trusted || []).includes(otherUser._id));

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

  async function toggleTrustedGhost() {
    setIsOpen(false);
    try {
      await toggleTrusted(otherUser._id);
    } catch (err) {
      onError(err.message);
    }
  }

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
          {isDirect && otherUser && (
            <MenuItem
              icon={Star}
              label={isTrusted ? 'Remove from Trusted Ghosts' : '⭐ Add to Trusted Ghosts'}
              hint={isTrusted ? '' : 'Pinned at the top of your chats'}
              onClick={toggleTrustedGhost}
            />
          )}
          <MenuItem
            icon={Image}
            label="🖼️ Chat background"
            hint="Just for this chat, on this device"
            onClick={() => open('background')}
          />
          {isDirect && otherUser && (
            <MenuItem
              icon={Sparkles}
              label={conversation.nicknames?.[otherUser._id] ? '💖 Change nickname' : '💖 Give a nickname'}
              hint="You both see it"
              disabled={blockedByMe}
              onClick={() => open('nickname')}
            />
          )}
          <MenuItem icon={Brain} label="Read the vibe" onClick={() => open('vibe')} />
          <MenuItem icon={Puzzle} label="Add inside joke" onClick={() => open('badge')} />
          {isDirect && <MenuItem icon={DoorOpen} label="Leave conversation" onClick={() => open('leave')} />}
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Eraser} label="Clear chat" hint="Only for you" onClick={() => open('clear')} />
          <MenuItem icon={Trash2} label="Delete chat" danger onClick={() => open('deleteChat')} />
          {isDirect &&
            otherUser &&
            (blockedByMe ? (
              <MenuItem icon={ShieldCheck} label={`Unblock ${otherUser.name}`} onClick={() => run(onUnblock)} />
            ) : (
              <MenuItem icon={Ban} label={`Block ${otherUser.name}`} danger onClick={() => open('block')} />
            ))}
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
