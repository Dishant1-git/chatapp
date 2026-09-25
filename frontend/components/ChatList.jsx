'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff, Check, Clock, Ghost, MessageCirclePlus, Phone, Search, Star, Trash2, UserRoundPlus, Users, WifiOff, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import { ConfirmDialog } from './ChatDialogs';
import { api } from '@/lib/client';
import Avatar, { ChatAvatar } from './Avatar';
import ThemeToggle from './ThemeToggle';
import dynamic from 'next/dynamic';
import UserSearch from './UserSearch';
// Opened from a button, so they're fetched when they're first needed rather
// than sitting in the download everyone pays for on the way in
const NewGroup = dynamic(() => import('./NewGroup'), { ssr: false });
const Profile = dynamic(() => import('./Profile'), { ssr: false });
const ScheduledMessages = dynamic(() => import('./ScheduledMessages'), { ssr: false });
const Calls = dynamic(() => import('./Calls'), { ssr: false });
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
  // 👥 Which half of the list is showing: one-to-one chats or groups
  const [tab, setTab] = useState('friends');
  // Right-click (or long-press) menu on a chat: { conversationId, x, y }
  const [menu, setMenu] = useState(null);
  const [deleting, setDeleting] = useState(null); // the chat waiting for "Delete chat?" confirmation
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(null);

  // 🗑️ The one row swiped aside to show its bin: { conversationId, side }
  const [swiped, setSwiped] = useState(null);
  const handleSwipe = useCallback(
    (conversationId, side) => setSwiped(side ? { conversationId, side } : null),
    []
  );
  const askToDelete = useCallback((conversation) => {
    setSwiped(null);
    setDeleting(conversation);
  }, []);
  const swipeSideOf = (conversation) => (swiped?.conversationId === conversation._id ? swiped.side : 0);

  const openMenu = useCallback((conversationId, x, y) => setMenu({ conversationId, x, y }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuConversation = menu && conversations.find((c) => c._id === menu.conversationId);

  // Remember the tab between visits (private browsing can block storage)
  const tabWasChosen = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ghosted:chatTab');
      if (saved === 'friends' || saved === 'groups') {
        tabWasChosen.current = true;
        setTab(saved);
      }
    } catch {
      // never mind, Friends is a fine default
    }
  }, []);

  // Until they pick a tab themselves, show the side that actually has chats —
  // so someone whose only chat is a group doesn't land on an empty list
  useEffect(() => {
    if (tabWasChosen.current) return;
    const hasGroups = conversations.some((c) => isGroup(c));
    const hasFriends = conversations.some((c) => !isGroup(c));
    if (tab === 'friends' && !hasFriends && hasGroups) setTab('groups');
    else if (tab === 'groups' && !hasGroups && hasFriends) setTab('friends');
  }, [conversations, tab]);

  // Opening a chat switches to its tab, so the open one is always in the list
  const syncedTabFor = useRef(null);
  useEffect(() => {
    if (!activeConversationId || syncedTabFor.current === activeConversationId) return;
    const active = conversations.find((c) => c._id === activeConversationId);
    if (!active) return; // not loaded yet — this runs again when it is
    syncedTabFor.current = activeConversationId;
    setTab(isGroup(active) ? 'groups' : 'friends');
  }, [activeConversationId, conversations]);

  function pickTab(next) {
    tabWasChosen.current = true;
    setTab(next);
    try {
      localStorage.setItem('ghosted:chatTab', next);
    } catch {
      // the tab still works for this visit
    }
  }

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

  // The tab splits the list — but a search looks through everything, so a group
  // you're looking for is never hidden behind the other tab
  const isSearching = query.trim().length > 0;
  const visible = useMemo(
    () => (isSearching ? filtered : filtered.filter((c) => isGroup(c) === (tab === 'groups'))),
    [filtered, isSearching, tab]
  );
  // Unread waiting on the tab you're not looking at
  const unreadOn = (wantGroups) =>
    conversations.some((c) => isGroup(c) === wantGroups && !c.isMuted && c.unreadCount > 0);

  // ⭐ Trusted Ghosts are pinned in their own section at the top
  const trustedIds = user?.trusted || [];
  const isTrustedChat = (c) => !isGroup(c) && trustedIds.includes(c.otherUser?._id);
  const trustedChats = visible.filter(isTrustedChat);
  const otherChats = trustedChats.length ? visible.filter((c) => !isTrustedChat(c)) : visible;

  return (
    <div className="brand-header relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 pt-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-brand">Ghost-ed</h1>
        <div className="flex items-center">
          <button
            onClick={() => setSidebarPanel('calls')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
            aria-label="Call logs"
            title="Calls"
          >
            <Phone size={19} />
          </button>
          <button
            onClick={() => setSidebarPanel('scheduled')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
            aria-label="Scheduled messages"
            title="Scheduled messages"
          >
            <Clock size={20} />
          </button>
          <button
            onClick={() => setSidebarPanel('newGroup')}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg md:flex"
            aria-label="New group"
            title="New group"
          >
            <Users size={20} />
          </button>
          {/* On a phone the round button at the bottom of the list does this instead */}
          <button
            onClick={() => setSidebarPanel('newChat')}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg md:flex"
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
            className="w-full rounded-full border border-line bg-panel py-2.5 pr-10 pl-10 text-base text-fg outline-none placeholder:text-muted focus:border-brand/40 md:text-sm"
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

      {/* 👥 One-to-one chats or groups. A search looks through both. */}
      {!isSearching && (
        <div className="flex items-center gap-2 px-3 pb-2">
          <TabPill
            label="Friends"
            isActive={tab === 'friends'}
            hasUnread={tab !== 'friends' && unreadOn(false)}
            onClick={() => pickTab('friends')}
          />
          <TabPill
            label="Groups"
            isActive={tab === 'groups'}
            hasUnread={tab !== 'groups' && unreadOn(true)}
            onClick={() => pickTab('groups')}
          />
        </div>
      )}

      {/* The panel curves up over the header strip and holds the conversations */}
      <ul className="scroll-thin surface mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-t-[2rem] pt-3 pb-[env(safe-area-inset-bottom)] text-fg">
        <li className="flex items-center justify-between px-5 pb-1">
          <h2 className="text-lg font-semibold">Recent</h2>
          <span className="text-xs text-muted">{visible.length}</span>
        </li>
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
            swipeSide={swipeSideOf(conversation)}
            onSwipe={handleSwipe}
            onDelete={askToDelete}
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
            swipeSide={swipeSideOf(conversation)}
            onSwipe={handleSwipe}
            onDelete={askToDelete}
          />
        ))}

        {conversations.length === 0 && (
          <li className="px-8 py-16 text-center">
            <p className="font-medium">No conversations yet</p>
            <p className="mt-1 text-sm text-muted">Find someone to start chatting with.</p>
            <button
              onClick={() => setSidebarPanel('newChat')}
              className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-strong"
            >
              Start a new chat
            </button>
          </li>
        )}

        {/* Nothing on this tab, but chats exist on the other one */}
        {conversations.length > 0 && !isSearching && visible.length === 0 && (
          <li className="px-8 py-14 text-center">
            <p className="font-medium">{tab === 'groups' ? 'No group chats yet' : 'No one-to-one chats yet'}</p>
            <p className="mt-1 text-sm text-muted">
              {tab === 'groups' ? 'Make one with a few people.' : 'Find someone to start chatting with.'}
            </p>
            <button
              onClick={() => setSidebarPanel(tab === 'groups' ? 'newGroup' : 'newChat')}
              className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-strong"
            >
              {tab === 'groups' ? 'New group' : 'Start a new chat'}
            </button>
          </li>
        )}

        {conversations.length > 0 && isSearching && visible.length === 0 && (
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

      {/* 📱 Phones: the round button for the thing you'd do on this tab */}
      <button
        onClick={() => setSidebarPanel(tab === 'groups' ? 'newGroup' : 'newChat')}
        className="absolute right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg transition hover:bg-brand-strong active:scale-95 md:hidden"
        aria-label={tab === 'groups' ? 'New group' : 'New chat'}
        title={tab === 'groups' ? 'New group' : 'New chat'}
      >
        {tab === 'groups' ? <Users size={24} /> : <UserRoundPlus size={24} />}
      </button>

      {menuConversation && (
        <ChatContextMenu
          conversation={menuConversation}
          x={menu.x}
          y={menu.y}
          isTrusted={isTrustedChat(menuConversation)}
          onMute={(muted) => setMuted(menuConversation, muted)}
          onToggleTrusted={() => toggleTrustedGhost(menuConversation)}
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
        {sidebarPanel === 'scheduled' && <ScheduledMessages key="scheduled" onClose={() => setSidebarPanel(null)} />}
        {sidebarPanel === 'calls' && <Calls key="calls" onClose={() => setSidebarPanel(null)} />}
      </AnimatePresence>
    </div>
  );
}

// One of the two switches above the list. The dot means: unread over there.
// The Calls screen uses the same pair.
export function TabPill({ label, isActive, hasUnread, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
        isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-hover'
      }`}
    >
      {isActive && <Check size={15} className="shrink-0" />}
      {label}
      {hasUnread && (
        <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-brand" aria-label="Unread messages" />
      )}
    </button>
  );
}

const LONG_PRESS_MS = 450;
const MENU_WIDTH = 232; // px

// The options for one chat, opened where it was right-clicked or long-pressed
// (Deleting a chat is done by swiping the row — see SwipeBin.)
function ChatContextMenu({ conversation, x, y, isTrusted, onMute, onToggleTrusted, onClose }) {
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
      className="fixed z-40 overflow-hidden rounded-2xl border border-line bg-panel py-1 text-sm text-fg shadow-xl"
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
    </motion.div>
  );
}

function ContextMenuItem({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover"
    >
      <Icon size={17} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

const SWIPE_REVEAL = 80; // px the row slides aside to show the bin

function SwipeBin({ visible, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      aria-label="Delete chat"
      className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${visible ? '' : 'invisible'}`}
      style={{ width: SWIPE_REVEAL }}
    >
      <Trash2 size={20} />
      Delete
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
  // 🗑️ Swipe: 1 = swiped right (bin on the left), -1 = swiped left (bin on the right), 0 = closed
  swipeSide = 0,
  onSwipe,
  onDelete,
}) {
  const { lastMessage, lastMessageAt, unreadCount, isMuted, ghost, streak = 0 } = conversation;
  const longPress = useRef({ timer: null, fired: false });
  const touch = useRef({ startX: 0, startY: 0, axis: null, moved: false });
  const [dragX, setDragX] = useState(null); // how far the row follows the finger, while swiping
  const openX = swipeSide * SWIPE_REVEAL;
  const x = dragX ?? openX;

  // Right-click on a computer, long-press on a phone: the chat's options menu
  function handleContextMenu(event) {
    event.preventDefault();
    onMenu(conversation._id, event.clientX, event.clientY);
  }
  function handleTouchStart(event) {
    const point = event.touches[0];
    touch.current = { startX: point.clientX, startY: point.clientY, axis: null, moved: false };
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      navigator.vibrate?.(10);
      onMenu(conversation._id, point.clientX, point.clientY);
    }, LONG_PRESS_MS);
  }
  function cancelLongPress() {
    clearTimeout(longPress.current.timer);
  }
  // Sideways moves slide the row; up/down moves are left to the list's scrolling
  function handleTouchMove(event) {
    const point = event.touches[0];
    const t = touch.current;
    const dx = point.clientX - t.startX;
    const dy = point.clientY - t.startY;
    if (!t.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      t.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      cancelLongPress();
    }
    if (t.axis === 'x') {
      t.moved = true;
      const limit = SWIPE_REVEAL * 1.25;
      setDragX(Math.max(-limit, Math.min(limit, openX + dx)));
    }
  }
  // Let go past halfway: the bin stays showing. Otherwise the row slides back.
  function handleTouchEnd() {
    cancelLongPress();
    if (touch.current.axis !== 'x' || dragX === null) return;
    const side = dragX <= -SWIPE_REVEAL / 2 ? -1 : dragX >= SWIPE_REVEAL / 2 ? 1 : 0;
    setDragX(null);
    onSwipe(conversation._id, side);
  }
  function handleClick(event) {
    // The tap that ends a long press or a swipe shouldn't also open the chat,
    // and tapping a row with its bin showing just slides it back
    if (longPress.current.fired || touch.current.moved || swipeSide !== 0) {
      event.preventDefault();
      longPress.current.fired = false;
      touch.current.moved = false;
      if (swipeSide !== 0) onSwipe(conversation._id, 0);
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
    <li className="relative mx-2 overflow-hidden rounded-xl">
      {/* 🗑️ Behind the row: a red bin on whichever side the row slid away from */}
      {x !== 0 && (
        <div className="absolute inset-0 flex items-stretch justify-between bg-red-600 text-white">
          <SwipeBin visible={x > 0} onClick={() => onDelete(conversation)} />
          <SwipeBin visible={x < 0} onClick={() => onDelete(conversation)} />
        </div>
      )}
      <Link
        href={`/chat/${conversation._id}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{ transform: x ? `translateX(${x}px)` : undefined }}
        // touch-action: pan-y lets the list scroll up and down while we handle sideways swipes
        className={`relative mx-2 flex touch-pan-y items-center gap-3 rounded-2xl px-3 py-3 select-none [-webkit-touch-callout:none] ${
          dragX === null ? 'transition-[transform,background-color] duration-200' : ''
        } ${
          // Solid while slid aside, so the red doesn't show through
          x !== 0 ? 'bg-panel' : isActive ? 'bg-brand-soft' : 'hover:bg-hover active:bg-hover'
        }`}
      >
        <ChatAvatar conversation={conversation} size={52} showStatus viewable />

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
                    className={`private truncate ${lastMessage?.isDeleted || lastMessage?.undecryptable ? 'italic' : ''}`}
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
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                    isMuted ? 'bg-muted text-panel' : 'bg-brand text-on-brand'
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

