'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { BellOff, Ghost, MessageCirclePlus, Search, Users, WifiOff, X } from 'lucide-react';
import { useChat } from './ChatProvider';
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
  } = useChat();
  const [query, setQuery] = useState('');

  // Conversation search happens in the browser — the list is already loaded
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        conversationTitle(c).toLowerCase().includes(q) ||
        (!isGroup(c) && c.otherUser?.email?.toLowerCase().includes(q))
    );
  }, [conversations, query]);

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
        {filtered.map((conversation) => (
          <ConversationItem
            key={conversation._id}
            conversation={conversation}
            myId={user._id}
            isActive={conversation._id === activeConversationId}
            typingUsers={typingIn[conversation._id]}
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

      {/* Slide-over panels, like WhatsApp: they cover the list, not the chat */}
      <AnimatePresence>
        {sidebarPanel === 'newChat' && (
          <UserSearch key="search" initialQuery={query} onClose={() => setSidebarPanel(null)} />
        )}
        {sidebarPanel === 'newGroup' && <NewGroup key="group" onClose={() => setSidebarPanel(null)} />}
        {sidebarPanel === 'profile' && <Profile key="profile" onClose={() => setSidebarPanel(null)} />}
      </AnimatePresence>
    </div>
  );
}

// memo: a row only re-renders when its own conversation changes
const ConversationItem = memo(function ConversationItem({ conversation, myId, isActive, typingUsers }) {
  const { lastMessage, lastMessageAt, unreadCount, isMuted, ghost } = conversation;
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
        className={`mx-2 flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition ${
          isActive ? 'bg-brand-soft' : 'hover:bg-hover active:bg-hover'
        }`}
      >
        <ChatAvatar conversation={conversation} size={50} showStatus />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 font-medium">
              <span className="truncate">{conversationTitle(conversation)}</span>
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

