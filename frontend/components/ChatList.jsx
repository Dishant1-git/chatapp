'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff, Ghost, MessageCirclePlus, Search, Star, Trash2, Users, WifiOff, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import { ConfirmDialog } from './ChatDialogs';
import { api } from '@/lib/client';
import Avatar, { ChatAvatar } from './Avatar';
import ThemeToggle from './ThemeToggle';
import UserSearch from './UserSearch';
import NewGroup from './NewGroup';
import Profile from './Profile';
import { MessageTicks } from './Message';
import { formatListDate, messagePreview } from '@/lib/format';
import { conversationTitle, isGroup, makeNameOf, typingText } from '@/lib/conversations';
import { isDeadChat } from '@/lib/social';

export default function ChatList() {
  const {
    user,
    conversations,
    typingIn,
    activeConversationId,
    isConnected,
    sidebarPanel,
    setSidebarPanel,
    updateConversation,
    removeConversation,
    toggleTrusted,
  } = useChat();
  const [query, setQuery] = useState('');
  // Right-click (or long-press) menu on a chat: { conversationId, x, y }
  const [menu, setMenu] = useState(null);
  const [deleting, setDeleting] = useState(null); // the chat waiting for "Delete chat?" confirmation
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(null);

  const openMenu = useCallback((conversationId, x, y) => setMenu({ conversationId, x, y }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuConversation = menu && conversations.find((c) => c._id === menu.conversationId);

  function showNotice(text) {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3000);
  }

  async function setMuted(conversation, muted) {
    try {
      const data = await api(`/api/conversations/${conversation._id}/mute`, { method: 'POST', body: { muted } });
      updateConversation(conversation._id, { isMuted: data.isMuted });
    } catch (err) {
      showNotice(err.message);
    }
  }

  async function toggleTrustedGhost(conversation) {
    try {
      await toggleTrusted(conversation.otherUser._id);
    } catch (err) {
      showNotice(err.message);
    }
  }

  async function deleteChat(conversation) {
    try {
      await api(`/api/conversations/${conversation._id}`, { method: 'DELETE' });
      removeConversation(conversation._id);
    } catch (err) {
      showNotice(err.message);
    }
  }

  // Conversation search happens in the browser — the list is already loaded
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        conversationTitle(c).toLowerCase().includes(q) ||
        // Their real name too, when I gave them a nickname
        (!isGroup(c) && c.otherUser?.name?.toLowerCase().includes(q))
    );
  }, [conversations, query]);

  // ⭐ Trusted Ghosts are pinned in their own section at the top
  const trustedIds = user?.trusted || [];
  const isTrustedChat = (c) => !isGroup(c) && trustedIds.includes(c.otherUser?._id);
  const trustedChats = filtered.filter(isTrustedChat);
  const otherChats = trustedChats.length ? filtered.filter((c) => !isTrustedChat(c)) : filtered;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
        <h1 className="text-xl font-semibold tracking-tight">
          <span className="md:hidden">Ghosted</span>
          <span className="hidden md:inline">Chats</span>
        </h1>
        <div className="flex items-center">
          <button
            onClick={() => setSidebarPanel('newGroup')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
            aria-label="New group"
            title="New group"
          >
            <Users size={20} />
          </button>
          <button
            onClick={() => setSidebarPanel('newChat')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
            aria-label="New chat"
            title="New chat"
          >
            <MessageCirclePlus size={21} />
          </button>
          <ThemeToggle className="md:hidden" />
          <button
            onClick={() => setSidebarPanel('profile')}
            className="ml-1 rounded-full md:hidden"
            aria-label="Your profile"
          >
            <Avatar user={user} size={34} />
          </button>
        </div>
      </header>

      {!isConnected && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 md:hidden dark:text-amber-400">
          <WifiOff size={14} /> Connecting… messages will arrive once you're back online.
        </div>
      )}

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full rounded-full bg-panel-soft py-2.5 pr-10 pl-10 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/25 md:text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-hover"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {trustedChats.length > 0 && (
          <li className="px-5 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">⭐ Trusted Ghosts</li>
        )}
        {trustedChats.map((conversation) => (
          <ConversationItem
            key={conversation._id}
            conversation={conversation}
            myId={user._id}
            isActive={conversation._id === activeConversationId}
            typingUsers={typingIn[conversation._id]}
            isTrusted
            onMenu={openMenu}
          />
        ))}
        {trustedChats.length > 0 && otherChats.length > 0 && (
          <li className="px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">All chats</li>
        )}
        {otherChats.map((conversation) => (
          <ConversationItem
            key={conversation._id}
            conversation={conversation}
            myId={user._id}
            isActive={conversation._id === activeConversationId}
            typingUsers={typingIn[conversation._id]}
            onMenu={openMenu}
          />
        ))}

        {conversations.length === 0 && (
          <li className="px-8 py-16 text-center">
            <p className="font-medium">No conversations yet</p>
            <p className="mt-1 text-sm text-muted">Find someone to start chatting with.</p>
            <button
              onClick={() => setSidebarPanel('newChat')}
              className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-strong"
            >
              Start a new chat
            </button>
          </li>
        )}

        {conversations.length > 0 && filtered.length === 0 && (
          <li className="px-8 py-12 text-center text-sm text-muted">
            No chats match “{query}”.
            <button
              onClick={() => setSidebarPanel('newChat')}
              className="mt-3 block w-full font-medium text-brand hover:underline"
            >
              Search all people
            </button>
          </li>
        )}
      </ul>

      {menuConversation && (
        <ChatContextMenu
          conversation={menuConversation}
          x={menu.x}
          y={menu.y}
          isTrusted={isTrustedChat(menuConversation)}
          onMute={(muted) => setMuted(menuConversation, muted)}
          onToggleTrusted={() => toggleTrustedGhost(menuConversation)}
          onDelete={() => setDeleting(menuConversation)}
          onClose={closeMenu}
        />
      )}

      {notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <p className="rounded-full bg-fg px-4 py-2 text-center text-sm text-panel shadow-lg">{notice}</p>
        </div>
      )}

      {/* Slide-over panels, like WhatsApp: they cover the list, not the chat */}
      <AnimatePresence>
        {deleting && (
          <ConfirmDialog
            key="delete-chat"
            title="Delete this chat?"
            text={`All messages with ${conversationTitle(deleting)} disappear for you and the chat leaves your list. It comes back if a new message arrives.`}
            confirmLabel="Delete chat"
            onConfirm={() => deleteChat(deleting)}
            onClose={() => setDeleting(null)}
          />
        )}
        {sidebarPanel === 'newChat' && (
          <UserSearch key="search" initialQuery={query} onClose={() => setSidebarPanel(null)} />
        )}
        {sidebarPanel === 'newGroup' && <NewGroup key="group" onClose={() => setSidebarPanel(null)} />}
        {sidebarPanel === 'profile' && <Profile key="profile" onClose={() => setSidebarPanel(null)} />}
      </AnimatePresence>
    </div>
  );
}

const LONG_PRESS_MS = 450;
const MENU_WIDTH = 232; // px

// The options for one chat, opened where it was right-clicked or long-pressed
function ChatContextMenu({ conversation, x, y, isTrusted, onMute, onToggleTrusted, onDelete, onClose }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const isDirect = !isGroup(conversation) && conversation.otherUser;

  // Keep the whole menu on screen: open to the left / upwards near the edges
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - el.offsetWidth - margin));
    const top = y + el.offsetHeight + margin > window.innerHeight ? Math.max(margin, y - el.offsetHeight) : y;
    setPosition({ left, top });
  }, [x, y]);

  // Close when tapping anywhere else, pressing Escape or scrolling the list
  useEffect(() => {
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) onClose();
    }
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  function run(action) {
    onClose();
    action();
  }

  return (
    <motion.div
      ref={menuRef}
      role="menu"
      aria-label={`Options for ${conversationTitle(conversation)}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      className="fixed z-40 overflow-hidden rounded-2xl border border-line bg-panel py-1 text-sm shadow-xl"
      style={{ ...position, width: MENU_WIDTH }}
      // A right-click on the menu itself shouldn't open the browser's menu
      onContextMenu={(e) => e.preventDefault()}
    >
      {conversation.isMuted ? (
        <ContextMenuItem icon={Bell} label="Unmute" onClick={() => run(() => onMute(false))} />
      ) : (
        <ContextMenuItem icon={BellOff} label="Mute" onClick={() => run(() => onMute(true))} />
      )}
      {isDirect && (
        <ContextMenuItem
          icon={Star}
          label={isTrusted ? 'Remove from Trusted Ghosts' : '⭐ Add to Trusted Ghosts'}
          onClick={() => run(onToggleTrusted)}
        />
      )}
      <ContextMenuItem icon={Trash2} label="Delete chat" danger onClick={() => run(onDelete)} />
    </motion.div>
  );
}

function ContextMenuItem({ icon: Icon, label, danger, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover ${
        danger ? 'text-red-600 dark:text-red-400' : ''
      }`}
    >
      <Icon size={17} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// memo: a row only re-renders when its own conversation changes
const ConversationItem = memo(function ConversationItem({
  conversation,
  myId,
  isActive,
  typingUsers,
  isTrusted = false,
  onMenu,
}) {
  const { lastMessage, lastMessageAt, unreadCount, isMuted, ghost, streak = 0 } = conversation;
  const longPress = useRef({ timer: null, fired: false });

  // Right-click on a computer, long-press on a phone: the chat's options menu
  function handleContextMenu(event) {
    event.preventDefault();
    onMenu(conversation._id, event.clientX, event.clientY);
  }
  function handleTouchStart(event) {
    const touch = event.touches[0];
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      navigator.vibrate?.(10);
      onMenu(conversation._id, touch.clientX, touch.clientY);
    }, LONG_PRESS_MS);
  }
  function cancelLongPress() {
    clearTimeout(longPress.current.timer);
  }
  // The tap that ends a long press shouldn't also open the chat
  function handleClick(event) {
    if (longPress.current.fired) {
      event.preventDefault();
      longPress.current.fired = false;
    }
  }
  const isMine = lastMessage?.senderId === myId;
  const showUnread = unreadCount > 0 && !isMuted;
  const nameOf = makeNameOf(conversation, myId);
  const typing = typingText(conversation, typingUsers);
  // In groups, show who wrote the last message: "Ann: see you soon"
  const showSender =
    isGroup(conversation) && !isMine && lastMessage && !lastMessage.isDeleted && lastMessage.messageType !== 'event';
  // Messages from someone I'm ghosting stay hidden here too
  const hiddenByGhost =
    ghost?.by === myId &&
    lastMessage &&
    !isMine &&
    lastMessage.messageType !== 'event' &&
    !lastMessage.forgiveness &&
    new Date(lastMessage.createdAt) >= new Date(ghost.since || 0);
  const isDead = isDeadChat(conversation);

  return (
    <li>
      <Link
        href={`/chat/${conversation._id}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        className={`mx-2 flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition select-none [-webkit-touch-callout:none] ${
          isActive ? 'bg-brand-soft' : 'hover:bg-hover active:bg-hover'
        }`}
      >
        <ChatAvatar conversation={conversation} size={50} showStatus viewable />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 font-medium">
              <span className="truncate">{conversationTitle(conversation)}</span>
              {/* 🔥 Connection streak, next to the name */}
              {streak >= 2 && (
                <span
                  className="shrink-0 text-xs font-semibold text-orange-500"
                  title={`${streak}-day connection streak`}
                >
                  🔥 {streak}
                </span>
              )}
              {isTrusted && (
                <span className="shrink-0 text-xs" title="Trusted Ghost">
                  ⭐
                </span>
              )}
              {ghost && (
                <Ghost
                  size={14}
                  className="shrink-0 text-muted"
                  aria-label={ghost.by === myId ? 'You ghosted them' : 'Ghosted you'}
                />
              )}
              {isDead && (
                <span className="shrink-0 text-sm" title="This chat is officially dead">
                  🪦
                </span>
              )}
            </p>
            <span className={`shrink-0 text-xs ${showUnread ? 'font-medium text-brand' : 'text-muted'}`}>
              {lastMessage ? formatListDate(lastMessageAt) : ''}
            </span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 text-sm text-muted">
              {typing ? (
                <span className="truncate font-medium text-brand">{typing}</span>
              ) : (
                <>
                  {isMine && !lastMessage.isDeleted && lastMessage.messageType !== 'event' && (
                    <MessageTicks message={lastMessage} />
                  )}
                  <span
                    className={`truncate ${lastMessage?.isDeleted || lastMessage?.undecryptable ? 'italic' : ''}`}
                  >
                    {showSender && `${nameOf(lastMessage.senderId)}: `}
                    {hiddenByGhost ? '👻 Ghosted' : lastMessage ? messagePreview(lastMessage, { nameOf, myId }) : 'Say hello 👋'}
                  </span>
                </>
              )}
            </p>
            <span className="flex shrink-0 items-center gap-1.5">
              {isMuted && <BellOff size={15} className="text-muted" aria-label="Muted" />}
              {unreadCount > 0 && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white ${
                    isMuted ? 'bg-muted' : 'bg-brand'
                  }`}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
});

