'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronsDown, Loader2, Lock, MessageSquareOff, Phone, PhoneCall, Video } from 'lucide-react';
import { useChat } from './ChatProvider';
import { useCalls } from './CallProvider';
import { ChatAvatar } from './Avatar';
import Message from './Message';
import MessageInput from './MessageInput';
import DeleteDialog from './DeleteDialog';
<<<<<<< Updated upstream
import ChatMenu from './ChatMenu';
import GhostBanner from './GhostBanner';
import { ImageLightbox, ImageSendPreview } from './ImagePreview';
import { api } from '@/lib/client';
import { ghostStage } from '@/lib/ghost';
import { formatDayDivider, formatLastSeen, isDifferentDay } from '@/lib/format';
=======
import GroupInfo from './GroupInfo';
import { ImageLightbox, ImageSendPreview } from './ImagePreview';
import { api } from '@/lib/client';
import { describeEvent, formatDayDivider, formatLastSeen, formatTime, isDifferentDay } from '@/lib/format';
import { encryptFile, encryptMessage, openMessage, openMessages, prepareImage, rememberImage } from '@/lib/e2ee';
import {
  conversationTitle,
  isGroup,
  makeNameOf,
  markDeliveredTo,
  markReadBy,
  memberSummary,
  typingText,
} from '@/lib/conversations';
>>>>>>> Stashed changes

// Start loading older messages when the user scrolls this close to the top
const LOAD_OLDER_THRESHOLD = 150;

// Adds a message to the list, or replaces the copy we already have.
// clientId is the temporary id of the optimistic message the sender created.
// keepExisting: don't overwrite a copy that already arrived over the socket
// (it may already have newer delivered/read ticks).
function addOrReplace(list, message, clientId, { keepExisting = false } = {}) {
  if (list.some((m) => m._id === message._id)) {
    const withoutTemp = list.filter((m) => m._id !== clientId);
    return keepExisting ? withoutTemp : withoutTemp.map((m) => (m._id === message._id ? message : m));
  }
  if (clientId && list.some((m) => m._id === clientId)) {
    return list.map((m) => (m._id === clientId ? message : m));
  }
  return [...list, message];
}

// After a reconnect: merge the newest page from the server into what we have.
// MongoDB ids sort by creation time, and "temp-…" ids sort last (they are the newest).
function mergeLatest(list, latest) {
  const byId = new Map(list.map((m) => [m._id, m]));
  latest.forEach((m) => byId.set(m._id, m));
  return [...byId.values()].sort((a, b) => (a._id < b._id ? -1 : 1));
}

export default function ChatWindow({ conversationId }) {
  const { user, socket, conversations, typingIn, addConversation, updateConversation, markAsRead, goBackToList } =
    useChat();
  const { startCall, joinCall, activeCalls, currentCall } = useCalls();

  const conversation = conversations.find((c) => c._id === conversationId);
  const isGroupChat = isGroup(conversation);
  const otherUser = conversation?.otherUser;
  const myId = user._id;
  const typing = typingText(conversation, typingIn[conversationId]);
  // Only changes when someone joins, leaves or is renamed (not on every online/offline
  // update), so memoized bubbles don't re-render
  const memberNames = JSON.stringify((conversation?.participants || []).map((p) => [p._id, p.name]));
  const nameOf = useMemo(
    () => makeNameOf({ participants: JSON.parse(memberNames).map(([_id, name]) => ({ _id, name })) }, myId),
    [memberNames, myId]
  );
  const activeCall = activeCalls[conversationId];
  const canJoinCall = activeCall && currentCall?.callId !== activeCall.callId;

  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading'); // loading | ready | error | notfound
  const [errorText, setErrorText] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [pickedImage, setPickedImage] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [notice, setNotice] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [, rerender] = useState(0);

  const ghost = conversation?.ghost || null;
  const stage = ghostStage(ghost);
  const iAmGhosted = Boolean(stage) && ghost.by !== myId;
  const canSend = !iAmGhosted || stage === 'pending' || stage === 'emojiOnly';

  // Emojis-only ends on its own after 15 minutes: re-render then to lock the input
  const emojiUntil = stage === 'emojiOnly' ? ghost.emojiUntil : null;
  useEffect(() => {
    if (!emojiUntil) return;
    const timer = setTimeout(() => rerender((n) => n + 1), new Date(emojiUntil).getTime() - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [emojiUntil]);

  const listRef = useRef(null);
  const messageEls = useRef(new Map());
  const messagesRef = useRef([]);
  const hasMoreRef = useRef(false);
  const conversationRef = useRef(conversation);
  const loadingOlderRef = useRef(false);
  const scrollRestore = useRef(null);
  const stickToBottom = useRef(true);
  const noticeTimer = useRef(null);
  // Incoming messages are decrypted one after another so they stay in order
  const incomingQueue = useRef(Promise.resolve());

  useEffect(() => {
    messagesRef.current = messages;
    hasMoreRef.current = hasMore;
    conversationRef.current = conversation;
  });

  const showNotice = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3500);
  }, []);

  // Opened from a link or a brand-new chat: fetch the conversation if we don't have it
  const hasConversation = Boolean(conversation);
  useEffect(() => {
    if (hasConversation) return;
    api(`/api/conversations/${conversationId}`)
      .then((data) => addConversation(data.conversation))
      .catch((err) => {
        setStatus(err.status === 404 ? 'notfound' : 'error');
        setErrorText(err.message);
      });
  }, [hasConversation, conversationId, addConversation]);

  // Load the newest page of messages and mark the chat as read
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    api(`/api/conversations/${conversationId}/messages`)
      .then(async (data) => {
        const opened = await openMessages(data.messages, conversationId);
        if (cancelled) return;
        stickToBottom.current = true;
        setMessages(opened);
        setHasMore(data.hasMore);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err.status === 404 ? 'notfound' : 'error');
        setErrorText(err.message);
      });

    markAsRead(conversationId);
    return () => {
      cancelled = true;
    };
  }, [conversationId, markAsRead, reloadKey]);

  // Keep the scroll position right after messages change:
  // - after loading older messages, stay where the user was
  // - otherwise, stay at the bottom if the user was already there
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (scrollRestore.current) {
      el.scrollTop = el.scrollHeight - scrollRestore.current.height + scrollRestore.current.top;
      scrollRestore.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (loadingOlderRef.current || !hasMoreRef.current || !oldest) return [];

    loadingOlderRef.current = true;
    setIsLoadingOlder(true);
    try {
      const data = await api(`/api/conversations/${conversationId}/messages?before=${oldest._id}`);
      const opened = await openMessages(data.messages, conversationId);
      const el = listRef.current;
      if (el) scrollRestore.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => [...opened.filter((m) => !prev.some((p) => p._id === m._id)), ...prev]);
      setHasMore(data.hasMore);
      hasMoreRef.current = data.hasMore;
      return opened;
    } catch (err) {
      showNotice(err.message);
      return [];
    } finally {
      loadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [conversationId, showNotice]);

  // If the first page doesn't fill the screen, there's nothing to scroll — load more right away
  useEffect(() => {
    const el = listRef.current;
    if (status === 'ready' && el && hasMore && el.scrollHeight <= el.clientHeight) loadOlder();
  }, [status, hasMore, messages, loadOlder]);

  function handleScroll() {
    const el = listRef.current;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 120;
    setShowScrollDown(distanceFromBottom > 400);
    if (el.scrollTop < LOAD_OLDER_THRESHOLD) loadOlder();
  }

  function scrollToBottom() {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }

  // ---- Real-time events for this conversation ----
  useEffect(() => {
    if (!socket) return;

    function onNewMessage({ message, clientId }) {
      if (message.conversationId !== conversationId) return;
      incomingQueue.current = incomingQueue.current
        .then(async () => {
          const opened = await openMessage(message, conversationId);
          if (opened.senderId === myId) stickToBottom.current = true;
          setMessages((prev) => addOrReplace(prev, opened, clientId));
          if (opened.senderId !== myId && document.visibilityState === 'visible') markAsRead(conversationId);
        })
        .catch(() => {});
    }

    function onDeleted({ messageId, conversationId: id }) {
      if (id !== conversationId) return;
      const wiped = { isDeleted: true, text: '', image: '', ciphertext: '', undecryptable: false };
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id === messageId) return { ...m, ...wiped, reactions: [] };
          if (m.replyTo?._id === messageId) return { ...m, replyTo: { ...m.replyTo, ...wiped } };
          return m;
        })
      );
    }

    function onReaction({ messageId, conversationId: id, reactions }) {
      if (id !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)));
    }

    function onRead({ conversationId: id, readerId }) {
      if (id !== conversationId || readerId === myId) return;
      setMessages((prev) => prev.map((m) => (m.senderId === myId ? markReadBy(m, readerId) : m)));
    }

    function onDelivered({ conversationId: id, receiverId }) {
      if (id !== conversationId || receiverId === myId) return;
      setMessages((prev) => prev.map((m) => (m.senderId === myId ? markDeliveredTo(m, receiverId) : m)));
    }

    // Back online: fetch whatever arrived while we were disconnected
    function onReconnect() {
      api(`/api/conversations/${conversationId}/messages`)
        .then((data) => openMessages(data.messages, conversationId))
        .then((latest) => setMessages((prev) => mergeLatest(prev, latest)))
        .catch(() => {});
      if (document.visibilityState === 'visible') markAsRead(conversationId);
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:deleted', onDeleted);
    socket.on('message:reaction', onReaction);
    socket.on('messages:read', onRead);
    socket.on('messages:delivered', onDelivered);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:deleted', onDeleted);
      socket.off('message:reaction', onReaction);
      socket.off('messages:read', onRead);
      socket.off('messages:delivered', onDelivered);
      socket.off('connect', onReconnect);
    };
  }, [socket, conversationId, myId, markAsRead]);

  // Coming back to the tab counts as reading the new messages
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && conversationRef.current?.unreadCount > 0) {
        markAsRead(conversationId);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [conversationId, markAsRead]);

  // ---- Sending ----

  // Encrypts the message (and image) for every member, uploads, saves it,
  // then swaps the optimistic copy for the real one
  const deliver = useCallback(
    async (temp) => {
      async function encryptAndSend(members) {
        const payload = { text: temp.text };
        let prepared = null;
        if (temp.file) {
          prepared = await prepareImage(temp.file);
          payload.image = { type: prepared.type, width: prepared.width, height: prepared.height };
        }

        const { encrypted, contentKey } = await encryptMessage({ conversationId, members, payload });

        let image = '';
        if (prepared) {
          const file = await encryptFile(contentKey, prepared.blob);
          image = (await api('/api/upload/encrypted', { method: 'POST', file })).url;
          // Show our own copy without downloading and decrypting it again
          rememberImage(image, temp.localImage);
        }

        return api('/api/messages', {
          method: 'POST',
          body: { conversationId, ...encrypted, image, replyTo: temp.replyTo?._id, clientId: temp._id },
        });
      }

      try {
        let result;
        try {
          result = await encryptAndSend(conversationRef.current?.participants || []);
        } catch (err) {
          if (err.code !== 'KEYS_CHANGED') throw err;
          // Someone joined, left or got new keys since we loaded the chat: refresh and try once more
          const { conversation: fresh } = await api(`/api/conversations/${conversationId}`);
          updateConversation(conversationId, { participants: fresh.participants, otherUser: fresh.otherUser });
          result = await encryptAndSend(fresh.participants);
        }

        const opened = await openMessage(result.message, conversationId);
        setMessages((prev) => addOrReplace(prev, opened, temp._id, { keepExisting: true }));
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m._id === temp._id ? { ...m, pending: false, failed: true } : m)));
        showNotice(err.message);
      }
    },
    [conversationId, updateConversation, showNotice]
  );

  // The message shows up immediately with a clock icon, then gets its ticks once saved
  const sendMessage = useCallback(
    (text, file = null) => {
      const localImage = file ? URL.createObjectURL(file) : '';
      const temp = {
        _id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        senderId: myId,
        text,
        image: localImage,
        localImage,
        file,
        messageType: file ? 'image' : 'text',
        replyTo: replyingTo,
        reactions: [],
        createdAt: new Date().toISOString(),
        pending: true,
      };

      stickToBottom.current = true;
      setMessages((prev) => [...prev, temp]);
      setReplyingTo(null);
      deliver(temp);
    },
    [conversationId, myId, replyingTo, deliver]
  );

  const retry = useCallback(
    (message) => {
      const temp = { ...message, pending: true, failed: false };
      setMessages((prev) => prev.map((m) => (m._id === message._id ? temp : m)));
      deliver(temp);
    },
    [deliver]
  );

  // ---- Message actions (callbacks are stable so memoized bubbles don't re-render) ----

  const react = useCallback(
    async (message, emoji) => {
      try {
        const { reactions } = await api(`/api/messages/${message._id}/reaction`, {
          method: 'POST',
          body: { emoji },
        });
        setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, reactions } : m)));
      } catch (err) {
        showNotice(err.message);
      }
    },
    [showNotice]
  );

  const requestDelete = useCallback((message) => {
    // A message that never reached the server is simply removed
    if (message.failed) {
      if (message.localImage) URL.revokeObjectURL(message.localImage);
      setMessages((prev) => prev.filter((m) => m._id !== message._id));
      return;
    }
    setDeleting(message);
  }, []);

  async function confirmDelete(mode) {
    const message = deleting;
    setDeleting(null);
    try {
      await api(`/api/messages/${message._id}?for=${mode}`, { method: 'DELETE' });
      if (mode === 'me') {
        setMessages((prev) => prev.filter((m) => m._id !== message._id));
        if (conversationRef.current?.lastMessage?._id === message._id) {
          updateConversation(conversationId, { lastMessage: null });
        }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === message._id ? { ...m, isDeleted: true, text: '', image: '', reactions: [] } : m
          )
        );
      }
    } catch (err) {
      showNotice(err.message);
    }
  }

  // Clicking a quoted message scrolls to the original, loading older pages if needed
  const jumpTo = useCallback(
    async (messageId) => {
      for (let i = 0; i < 10 && !messageEls.current.has(messageId); i++) {
        const older = await loadOlder();
        if (!older.length) break;
        await new Promise((resolve) => setTimeout(resolve, 50)); // let React render them
      }

      const el = messageEls.current.get(messageId);
      if (!el) return showNotice("The original message isn't available anymore.");

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth; // restart the animation
      el.classList.add('flash');
    },
    [loadOlder, showNotice]
  );

  const registerRef = useCallback((id, el) => {
    if (el) messageEls.current.set(id, el);
    else messageEls.current.delete(id);
  }, []);

  const handleImageLoad = useCallback(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, []);

  // The ghoster's answer to the ghosted person's one message
  async function decideGhost(shouldGhost) {
    setIsDeciding(true);
    try {
      const data = await api(`/api/conversations/${conversationId}/ghost/verdict`, {
        method: 'POST',
        body: { ghost: shouldGhost },
      });
      updateConversation(conversationId, { ghost: data.ghost });
    } catch (err) {
      showNotice(err.message);
    } finally {
      setIsDeciding(false);
    }
  }

  const closeLightbox = useCallback(() => setLightboxSrc(null), []);
  const closeImagePicker = useCallback(() => setPickedImage(null), []);
  const closeDeleteDialog = useCallback(() => setDeleting(null), []);

  async function handleCall(video) {
    try {
      if (canJoinCall) await joinCall(activeCall);
      else await startCall(conversationId, video);
    } catch (err) {
      showNotice(err.message);
    }
  }

  // ---- Render ----

  if (status === 'notfound') {
    return (
      <div className="chat-bg flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <MessageSquareOff size={40} className="text-muted" />
        <p className="font-medium">Conversation not found</p>
        <p className="text-sm text-muted">It may have been removed, or you don't have access to it.</p>
        <Link href="/chat" className="mt-2 rounded-full bg-brand px-5 py-2 text-sm font-medium text-white">
          Back to chats
        </Link>
      </div>
    );
  }

  const statusText = typing
    ? typing
    : isGroupChat
      ? memberSummary(conversation, myId)
      : otherUser?.isOnline
        ? 'online'
        : otherUser
          ? formatLastSeen(otherUser.lastSeen)
          : '';
  const statusIsHighlighted = Boolean(typing) || (!isGroupChat && otherUser?.isOnline);

  return (
    <div className="mobile-slide-in relative flex h-full min-h-0 flex-1 flex-col bg-panel">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 md:px-4">
        <button
          onClick={goBackToList}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-hover md:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft size={22} />
        </button>
<<<<<<< Updated upstream
        {otherUser && <Avatar user={otherUser} size={40} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate leading-tight font-semibold">{otherUser?.name || '…'}</h2>
          <p className={`truncate text-xs ${isTyping || otherUser?.isOnline ? 'text-brand' : 'text-muted'}`}>
            {statusText}
          </p>
        </div>
        {conversation && <ChatMenu conversation={conversation} myId={myId} onError={showNotice} />}
=======
        <button
          type="button"
          onClick={() => isGroupChat && setShowInfo(true)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left ${isGroupChat ? 'cursor-pointer' : 'cursor-default'}`}
          aria-label={isGroupChat ? 'Group info' : undefined}
        >
          {conversation && <ChatAvatar conversation={conversation} size={40} />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate leading-tight font-semibold">{conversationTitle(conversation) || '…'}</h2>
            <p className={`truncate text-xs ${statusIsHighlighted ? 'text-brand' : 'text-muted'}`}>{statusText}</p>
          </div>
        </button>

        {conversation &&
          (canJoinCall ? (
            <button
              onClick={() => handleCall(activeCall.video)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <PhoneCall size={16} /> Join
            </button>
          ) : (
            <div className="flex shrink-0 items-center">
              <button
                onClick={() => handleCall(true)}
                disabled={Boolean(currentCall)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg disabled:opacity-40"
                aria-label="Video call"
                title="Video call"
              >
                <Video size={21} />
              </button>
              <button
                onClick={() => handleCall(false)}
                disabled={Boolean(currentCall)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg disabled:opacity-40"
                aria-label="Voice call"
                title="Voice call"
              >
                <Phone size={19} />
              </button>
            </div>
          ))}
>>>>>>> Stashed changes
      </header>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="chat-bg scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-4 md:px-[5%] lg:px-[8%]"
      >
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center text-muted">
            <Loader2 className="animate-spin" size={26} />
          </div>
        )}

        {status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted">{errorText}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            {/* Absolutely positioned so it doesn't shift the messages while loading */}
            {isLoadingOlder && (
              <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                <span className="rounded-full bg-panel p-1.5 shadow">
                  <Loader2 size={18} className="animate-spin text-muted" />
                </span>
              </div>
            )}

            {!hasMore && conversation && (
              <p className="mx-auto mb-3 flex max-w-sm items-start gap-2 rounded-xl bg-amber-100/80 px-3 py-2 text-left text-xs text-amber-900 shadow-sm dark:bg-amber-400/10 dark:text-amber-200">
                <Lock size={13} className="mt-0.5 shrink-0" />
                <span>
                  Messages and calls are end-to-end encrypted. No one outside this chat, not even Ghosted, can read or
                  listen to them.
                </span>
              </p>
            )}

            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDay = !previous || isDifferentDay(previous.createdAt, message.createdAt);

              if (message.messageType === 'event') {
                return (
                  <Fragment key={message._id}>
                    {showDay && <DayDivider date={message.createdAt} />}
                    <EventNote message={message} nameOf={nameOf} myId={myId} />
                  </Fragment>
                );
              }

              const isGrouped =
                Boolean(previous) &&
                !showDay &&
                previous.messageType !== 'event' &&
                previous.senderId === message.senderId;
              const isMine = message.senderId === myId;

              return (
                <Fragment key={message._id}>
                  {showDay && <DayDivider date={message.createdAt} />}
                  <Message
                    message={message}
                    isMine={isMine}
                    isGrouped={isGrouped}
                    myId={myId}
                    nameOf={nameOf}
                    showSender={isGroupChat && !isMine && !isGrouped}
                    registerRef={registerRef}
                    onReply={setReplyingTo}
                    onReact={react}
                    onDelete={requestDelete}
                    onRetry={retry}
                    onJumpTo={jumpTo}
                    onOpenImage={setLightboxSrc}
                    onImageLoad={handleImageLoad}
                  />
                </Fragment>
              );
            })}

            {typing && (
              <div className="mt-2.5 flex">
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-bubble-in px-4 py-3 shadow-sm">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-muted"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-24 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-muted shadow-md hover:text-fg"
          aria-label="Scroll to latest messages"
        >
          <ChevronsDown size={20} />
        </button>
      )}

      {notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4">
          <p className="rounded-full bg-fg px-4 py-2 text-center text-sm text-panel shadow-lg">{notice}</p>
        </div>
      )}

<<<<<<< Updated upstream
      {ghost && (
        <GhostBanner
          ghost={ghost}
          myId={myId}
          otherName={otherUser?.name}
          isDeciding={isDeciding}
          onDecide={decideGhost}
          onJumpTo={jumpTo}
          asFooter={!canSend}
        />
      )}

      {canSend && (
        <MessageInput
          conversationId={conversationId}
          replyingTo={replyingTo}
          replyName={replyingTo?.senderId === myId ? 'yourself' : otherUser?.name}
          emojiOnly={iAmGhosted && stage === 'emojiOnly'}
          onCancelReply={() => setReplyingTo(null)}
          onSendText={sendMessage}
          onPickImage={setPickedImage}
          onError={showNotice}
        />
      )}
=======
      <MessageInput
        conversationId={conversationId}
        replyingTo={replyingTo}
        replyName={replyingTo ? (replyingTo.senderId === myId ? 'yourself' : nameOf(replyingTo.senderId)) : ''}
        onCancelReply={() => setReplyingTo(null)}
        onSendText={sendMessage}
        onPickImage={setPickedImage}
        onError={showNotice}
      />
>>>>>>> Stashed changes

      <AnimatePresence>
        {showInfo && isGroupChat && (
          <GroupInfo key="info" conversation={conversation} onClose={() => setShowInfo(false)} />
        )}
        {pickedImage && (
          <ImageSendPreview
            key="send-preview"
            file={pickedImage}
            onCancel={closeImagePicker}
            onSend={(file, caption) => {
              setPickedImage(null);
              sendMessage(caption, file);
            }}
          />
        )}
        {lightboxSrc && <ImageLightbox key="lightbox" src={lightboxSrc} onClose={closeLightbox} />}
        {deleting && (
          <DeleteDialog
            key="delete"
            canDeleteForEveryone={deleting.senderId === myId && !deleting.isDeleted}
            onDeleteForMe={() => confirmDelete('me')}
            onDeleteForEveryone={() => confirmDelete('everyone')}
            onClose={closeDeleteDialog}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DayDivider({ date }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-lg bg-panel px-3 py-1 text-xs font-medium text-muted shadow-sm">
        {formatDayDivider(date)}
      </span>
    </div>
  );
}

// Group changes and call logs: a small note in the middle of the chat
function EventNote({ message, nameOf, myId }) {
  const event = message.event || {};
  const isCall = event.type === 'call';
  const isMissed = isCall && !event.duration && String(message.senderId) !== myId;
  const Icon = event.video ? Video : Phone;

  return (
    <div className="my-2 flex justify-center">
      <span
        className={`flex max-w-[85%] items-center gap-1.5 rounded-lg bg-panel/95 px-3 py-1 text-center text-xs shadow-sm ${
          isMissed ? 'text-red-600 dark:text-red-400' : 'text-muted'
        }`}
      >
        {isCall && <Icon size={13} className="shrink-0" />}
        {describeEvent(message, nameOf, myId)}
        {isCall && <span className="opacity-70">· {formatTime(message.createdAt)}</span>}
      </span>
    </div>
  );
}
