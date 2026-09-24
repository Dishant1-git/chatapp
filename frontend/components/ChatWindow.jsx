'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronsDown, X, Heart, Loader2, Lock, MessageSquareOff, Pencil, Phone, PhoneCall, Video } from 'lucide-react';
import { useChat } from './ChatProvider';
import { useCalls } from './CallProvider';
import { ChatAvatar } from './Avatar';
import Message from './Message';
import MessageInput from './MessageInput';
import DeleteDialog from './DeleteDialog';
import ChatMenu from './ChatMenu';
import GhostBanner from './GhostBanner';
import GroupInfo from './GroupInfo';
import MissYouHearts from './MissYouHearts';
import { GhostClickCamera, GhostClickViewer } from './GhostClick';
import StickerStore from './StickerStore';
import { loadAccessibility, speak } from '@/lib/accessibility';
import Celebration from './Celebration';
import {
  BackgroundDialog,
  BadgeDialog,
  ConfirmDialog,
  EditMessageDialog,
  GhostDialog,
  LeaveDialog,
  NicknameDialog,
  VibePanel,
} from './ChatDialogs';
import { ImageLightbox } from './ImagePreview';
import { backgroundStyle } from '@/lib/chatBackground';
import { api } from '@/lib/client';
import { MOODS, PAUSE_REASONS, REVIVE_ANSWERS, isDeadChat, shakeElement, timezoneOffset } from '@/lib/social';
import { describeEvent, formatDayDivider, formatLastSeen, formatTime, isDifferentDay } from '@/lib/format';
import { decryptImage, decryptMedia, encryptFile, encryptMessage, openMessage, openMessages, prepareImage, rememberImage } from '@/lib/e2ee';
import {
  conversationTitle,
  isGroup,
  makeNameOf,
  markDeliveredTo,
  markReadBy,
  markUnreadBy,
  memberSummary,
  nicknameOf,
  typingText,
} from '@/lib/conversations';

const UNDO_SEEN_MS = 10000; // how long "Undo seen" is offered after opening a chat

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

// Notes that get a little moment on screen the first time I see them
const MOMENT_EVENTS = ['missYou', 'buzz', 'forgiven', 'stillGhosted', 'nickname'];

// One of those notes from the other person that I haven't seen yet
function isNewMoment(message, myId) {
  return (
    message.messageType === 'event' &&
    MOMENT_EVENTS.includes(message.event?.type) &&
    String(message.senderId) !== myId &&
    !(message.readBy || []).some((id) => String(id) === myId)
  );
}

// After a reconnect: merge the newest page from the server into what we have.
// MongoDB ids sort by creation time, and "temp-…" ids sort last (they are the newest).
function mergeLatest(list, latest) {
  const byId = new Map(list.map((m) => [m._id, m]));
  latest.forEach((m) => byId.set(m._id, m));
  return [...byId.values()].sort((a, b) => (a._id < b._id ? -1 : 1));
}

export default function ChatWindow({ conversationId }) {
  const {
    user,
    socket,
    conversations,
    typingIn,
    addConversation,
    updateConversation,
    markAsRead,
    goBackToList,
  } = useChat();
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
  // For effects and socket handlers; falls back to the name saved with the note
  // in case the chat's members haven't loaded yet
  const nameOfRef = useRef(nameOf);
  useEffect(() => {
    nameOfRef.current = (id, message) => nameOf(id, message?.event?.names?.[String(id)]);
  });
  const activeCall = activeCalls[conversationId];
  const canJoinCall = activeCall && currentCall?.callId !== activeCall.callId;

  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading'); // loading | ready | error | notfound
  const [errorText, setErrorText] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [ghostCamera, setGhostCamera] = useState(false); // 👻 Ghost Click camera open
  const [ghostView, setGhostView] = useState(null); // { src, kind, mode, caption, senderName }
  const [deleting, setDeleting] = useState(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [notice, setNotice] = useState('');
  const [isUnghosting, setIsUnghosting] = useState(false);
  const [missYouFrom, setMissYouFrom] = useState(null); // name to show in the hearts overlay
  const [isSendingMissYou, setIsSendingMissYou] = useState(false);
  const [isSendingBuzz, setIsSendingBuzz] = useState(false);
  const [celebration, setCelebration] = useState(null); // { emojis, title, subtitle }
// ghost | vibe | badge | leave | background | stickers | nickname | clear
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(null); // ✏️ the message being edited
  const [almostSaid, setAlmostSaid] = useState(false);
  const [undoSeen, setUndoSeen] = useState(0); // how many new messages I just saw (0 = hide "Undo seen")
  const rootRef = useRef(null);
  const suppressRead = useRef(false); // after "undo seen", don't mark as read again
  const almostSaidTimer = useRef(null);

  // Ghosting only exists in one-to-one chats. What the ghosted person can do
  // depends on the level (see lib/ghost.js).
  const ghost = isGroupChat ? null : conversation?.ghost || null;
  const ghostedByMe = ghost?.by === myId;
  const iAmGhosted = Boolean(ghost) && !ghostedByMe;
  // Ghosted or deep-ghosted: emojis only (until they're unghosted)
  const emojiOnly = iAmGhosted && ['ghosted', 'deep'].includes(ghost.level);
  // "Exit without drama": one of us stepped away from the chat
  const pausedBy = isGroupChat ? null : conversation?.pausedBy || null;
  // 🚫 I blocked them (if they blocked me, sending just fails with a short note)
  const blockedByMe = !isGroupChat && Boolean(conversation?.blockedByMe);
  const canType = !pausedBy && !blockedByMe && !(iAmGhosted && ghost.level === 'permanent');
  const isDead = status === 'ready' && isDeadChat(conversation);
  // Read by deliver(), which is a stable callback
  const emojiOnlyRef = useRef(emojiOnly);
  useEffect(() => {
    emojiOnlyRef.current = emojiOnly;
  });

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

  // Marks the chat as read — unless I just used "undo seen"
  const readNow = useCallback(() => {
    if (!suppressRead.current) markAsRead(conversationId);
  }, [markAsRead, conversationId]);

  // Hearts for "miss you", doves when I'm forgiven, a ghost when I'm not
  const showMoment = useCallback((message) => {
    const name = nameOfRef.current(message.senderId, message);
    const type = message.event?.type;
    if (type === 'missYou') setMissYouFrom(name);
    if (type === 'buzz') shakeElement(rootRef.current); // 📳 the phone vibrates too (ChatProvider)
    if (type === 'forgiven') setCelebration({ emojis: ['🕊️', '✨', '🤍'], title: "✨ You're unghosted", subtitle: `${name} forgave you` });
    if (type === 'stillGhosted') setCelebration({ emojis: ['👻'], title: '👻 Still ghosted', subtitle: `${name} isn't ready yet` });
    // 💖 They gave me a nickname
    if (type === 'nickname' && message.event.name) {
      setCelebration({
        emojis: ['💖', '🥰', '✨', '💕'],
        title: `💖 ${name} named you “${message.event.name}”`,
        subtitle: 'Aww, someone thinks you’re special',
      });
    }
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
    suppressRead.current = false;
    // Opening a chat with new messages marks them as seen: offer "undo seen"
    const hadUnread = conversationRef.current?.unreadCount || 0;

    api(`/api/conversations/${conversationId}/messages`)
      .then(async (data) => {
        const opened = await openMessages(data.messages, conversationId);
        if (cancelled) return;
        stickToBottom.current = true;
        setMessages(opened);
        setHasMore(data.hasMore);
        setStatus('ready');

        // Something happened while I was away (a "miss you", being forgiven…)
        const moment = opened.findLast((m) => isNewMoment(m, myId));
        if (moment) showMoment(moment);
        if (hadUnread) setUndoSeen(hadUnread);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err.status === 404 ? 'notfound' : 'error');
        setErrorText(err.message);
      })
      // Marked as read only after loading, so unseen notes are still recognisable
      .finally(() => !cancelled && markAsRead(conversationId));

    return () => {
      cancelled = true;
    };
  }, [conversationId, markAsRead, reloadKey, myId, showMoment]);

  // "👀 Oops… they'll know you saw it" goes away by itself
  useEffect(() => {
    if (!undoSeen) return;
    const timer = setTimeout(() => setUndoSeen(0), UNDO_SEEN_MS);
    return () => clearTimeout(timer);
  }, [undoSeen]);

  // 🔥 Opening a chat refreshes its streak, which is shown next to the name
  // in the chat list (the list loads them all in one go)
  useEffect(() => {
    if (isGroupChat || !hasConversation) return;
    let cancelled = false;
    api(`/api/conversations/${conversationId}/insights?tz=${encodeURIComponent(timezoneOffset())}`)
      .then((data) => !cancelled && updateConversation(conversationId, { streak: data.streak }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, isGroupChat, hasConversation, updateConversation]);

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

  // The list gets shorter when the keyboard opens (or the message box grows):
  // if I was at the bottom, keep the newest messages in view
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

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
          if (opened.senderId !== myId && document.visibilityState === 'visible') {
            if (isNewMoment(opened, myId)) showMoment(opened);
            // 🔊 Accessibility: read new messages aloud
            if (loadAccessibility().readAloud && opened.text && opened.messageType !== 'event') {
              speak(`${nameOfRef.current(opened.senderId, opened)} says: ${opened.text}`);
            }
            readNow();
          }
        })
        .catch(() => {});
    }

    function onDeleted({ messageId, conversationId: id }) {
      if (id !== conversationId) return;
      const wiped = { isDeleted: true, text: '', image: '', media: '', ciphertext: '', undecryptable: false };
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

    // A forgiveness request was answered, a revive got a reply, "character development"…
    function onUpdated({ messageId, conversationId: id, changes }) {
      if (id !== conversationId) return;
      if (changes?.ciphertext) return applyEdit(messageId, changes);
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, ...changes } : m)));
    }

    // ✏️ A message was edited: decrypt its new text (and any quotes of it)
    function applyEdit(messageId, changes) {
      incomingQueue.current = incomingQueue.current
        .then(async () => {
          const current = messagesRef.current.find((m) => m._id === messageId);
          const quoting = messagesRef.current.find((m) => m.replyTo?._id === messageId);
          const base = current || quoting?.replyTo;
          if (!base) return;
          const edited = await openMessage({ ...base, ...changes, replyTo: null }, conversationId);
          const { text, editedAt, ciphertext, iv, senderKey, keys, undecryptable } = edited;
          const fresh = { text, editedAt, ciphertext, iv, senderKey, keys, undecryptable };
          setMessages((prev) =>
            prev.map((m) => {
              if (m._id === messageId) return { ...m, ...fresh };
              if (m.replyTo?._id === messageId) return { ...m, replyTo: { ...m.replyTo, ...fresh } };
              return m;
            })
          );
        })
        .catch(() => {});
    }

    // 🧹 I cleared this chat (maybe in another tab)
    function onCleared({ conversationId: id }) {
      if (id === conversationId) setMessages([]);
    }

    // They used "undo seen": my ticks go back to delivered
    function onUnread({ conversationId: id, readerId }) {
      if (id !== conversationId || readerId === myId) return;
      setMessages((prev) => prev.map((m) => (m.senderId === myId ? markUnreadBy(m, readerId) : m)));
    }

    // 🫥 They typed something... then deleted it
    function onAlmostSaid({ conversationId: id, userId }) {
      if (id !== conversationId || userId === myId) return;
      setAlmostSaid(true);
      clearTimeout(almostSaidTimer.current);
      almostSaidTimer.current = setTimeout(() => setAlmostSaid(false), 7000);
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
      if (document.visibilityState === 'visible') readNow();
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:deleted', onDeleted);
    socket.on('message:reaction', onReaction);
    socket.on('message:updated', onUpdated);
    socket.on('conversation:cleared', onCleared);
    socket.on('messages:read', onRead);
    socket.on('messages:unread', onUnread);
    socket.on('messages:delivered', onDelivered);
    socket.on('almostSaid', onAlmostSaid);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:deleted', onDeleted);
      socket.off('message:reaction', onReaction);
      socket.off('message:updated', onUpdated);
      socket.off('conversation:cleared', onCleared);
      socket.off('messages:read', onRead);
      socket.off('messages:unread', onUnread);
      socket.off('messages:delivered', onDelivered);
      socket.off('almostSaid', onAlmostSaid);
      socket.off('connect', onReconnect);
    };
  }, [socket, conversationId, myId, readNow, showMoment]);

  // Coming back to the tab counts as reading the new messages
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && conversationRef.current?.unreadCount > 0) readNow();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [readNow]);

  // ---- Sending ----

  // Encrypts the message (and image) for every member, uploads, saves it,
  // then swaps the optimistic copy for the real one
  const deliver = useCallback(
    async (temp) => {
      async function encryptAndSend(members) {
        // 🌟 A sticker only travels as its id, inside the encrypted message
        const payload = {
          text: temp.text,
          ...(temp.sticker && { sticker: temp.sticker }),
          ...(temp.stickerImage && { stickerImage: true }),
        };
        let prepared = null;
        if (temp.file) {
          prepared = await prepareImage(temp.file);
          payload.image = { type: prepared.type, width: prepared.width, height: prepared.height };
        }
        if (temp.mediaBlob) {
          payload.media = {
            kind: temp.messageType,
            type: temp.mediaBlob.type,
            duration: temp.mediaDuration,
            waveform: temp.mediaWaveform,
            mirrored: temp.mediaMirrored,
          };
        }

        const { encrypted, contentKey } = await encryptMessage({ conversationId, members, payload });

        let image = '';
        if (prepared) {
          const file = await encryptFile(contentKey, prepared.blob);
          image = (await api('/api/upload/encrypted', { method: 'POST', file })).url;
          // Show our own copy without downloading and decrypting it again
          rememberImage(image, temp.localImage);
        }
        let media = '';
        if (temp.mediaBlob) {
          const file = await encryptFile(contentKey, temp.mediaBlob, 'media');
          media = (await api('/api/upload/encrypted', { method: 'POST', file })).url;
          rememberImage(media, temp.localMedia);
        }

        return api('/api/messages', {
          method: 'POST',
          body: {
            conversationId,
            ...encrypted,
            image,
            ...(media && { media, mediaKind: temp.messageType }),
            replyTo: temp.replyTo?._id,
            clientId: temp._id,
            ...(temp.forgiveness && { forgive: true }),
            ...(temp.ghostClick && { ghostClick: temp.ghostClick.mode }),
          },
        });
      }

      try {
        let result;
        try {
          result = emojiOnlyRef.current && !temp.forgiveness
            ? // Ghosted, emojis only: sent unencrypted so the server can check it's only emojis
              await api('/api/messages', {
                method: 'POST',
                body: { conversationId, text: temp.text, replyTo: temp.replyTo?._id, clientId: temp._id },
              })
            : await encryptAndSend(conversationRef.current?.participants || []);
        } catch (err) {
          if (err.code !== 'KEYS_CHANGED') throw err;
          // Someone joined, left or got new keys since we loaded the chat: refresh and try once more
          const { conversation: fresh } = await api(`/api/conversations/${conversationId}`);
          updateConversation(conversationId, { participants: fresh.participants, otherUser: fresh.otherUser });
          result = await encryptAndSend(fresh.participants);
        }

        // The recording didn't survive the save (an out-of-date server drops it),
        // which would leave an empty bubble behind. Better to say it failed.
        if (temp.mediaBlob && !result.message?.media) {
          throw new Error('Your recording could not be saved. The server needs to be updated to the latest version.');
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
  // forgive: send it as a 🕊️ forgiveness request (when I'm being ghosted)
  const sendMessage = useCallback(
    // ghostClick: 'once' | 'keep' for a 👻 Ghost Click photo; sticker: a sticker id
    (text, file = null, { forgive = false, ghostClick = null, sticker = '', stickerImage = false } = {}) => {
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
        ...(sticker && { sticker }),
        ...(stickerImage && { stickerImage: true }),
        replyTo: forgive ? null : replyingTo,
        reactions: [],
        createdAt: new Date().toISOString(),
        pending: true,
        ...(forgive && { forgiveness: { status: 'pending' } }),
        ...(ghostClick && file && { ghostClick: { mode: ghostClick, openedBy: [] } }),
      };

      // Writing again means I'm fine with them seeing I read their messages
      suppressRead.current = false;
      stickToBottom.current = true;
      setMessages((prev) => [...prev, temp]);
      setReplyingTo(null);
      deliver(temp);
    },
    [conversationId, myId, replyingTo, deliver]
  );

  // 🌟 One of my own stickers: a copy of the picture is encrypted and sent,
  // like a photo, so the other person doesn't need my sticker collection
  const sendCustomSticker = useCallback(
    async (url) => {
      try {
        const blob = await fetch(url).then((r) => r.blob());
        sendMessage('', new File([blob], 'sticker.webp', { type: blob.type || 'image/webp' }), { stickerImage: true });
      } catch {
        showNotice("That sticker couldn't be sent.");
      }
    },
    [sendMessage, showNotice]
  );

  // 🎤 / 📹 A recorded voice message (kind 'audio') or video note (kind 'video'),
  // shown straight away from the local recording while it uploads
  const sendMedia = useCallback(
    // options: text (a caption) and ghostClick ('once' | 'keep') for camera videos
    (kind, { blob, duration, waveform = [], mirrored = false }, { text = '', ghostClick = null } = {}) => {
      const localMedia = URL.createObjectURL(blob);
      const temp = {
        _id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        senderId: myId,
        text,
        ...(ghostClick && { ghostClick: { mode: ghostClick, openedBy: [] } }),
        media: localMedia,
        localMedia,
        mediaBlob: blob,
        mediaType: blob.type,
        mediaDuration: duration,
        mediaWaveform: waveform,
        mediaMirrored: mirrored,
        messageType: kind,
        replyTo: replyingTo,
        reactions: [],
        createdAt: new Date().toISOString(),
        pending: true,
      };

      suppressRead.current = false;
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
    async (message, emoji, anonymous = false) => {
      try {
        const { reactions } = await api(`/api/messages/${message._id}/reaction`, {
          method: 'POST',
          body: { emoji, anonymous },
        });
        setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, reactions } : m)));
        if (anonymous) showNotice('🫣 Reacted anonymously');
      } catch (err) {
        showNotice(err.message);
      }
    },
    [showNotice]
  );

  // 👀 Reveal which emoji an anonymous reaction was (3 a day)
  const revealReaction = useCallback(
    async (message) => {
      try {
        const { reactions, remaining } = await api(`/api/messages/${message._id}/reveal`, { method: 'POST' });
        setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, reactions } : m)));
        showNotice(`👀 Revealed · ${remaining} left today`);
      } catch (err) {
        showNotice(err.message);
      }
    },
    [showNotice]
  );

  // 🕊️ Forgive / 👻 Keep ghosting
  const answerForgiveness = useCallback(
    async (message, answer) => {
      try {
        const { ghost: updated } = await api(`/api/conversations/${conversationId}/ghost/answer`, {
          method: 'POST',
          body: { answer },
        });
        updateConversation(conversationId, { ghost: updated });
        if (answer === 'forgive') {
          setCelebration({ emojis: ['🕊️', '✨'], title: '🕊️ Forgiven', subtitle: 'Character development unlocked' });
        } else {
          showNotice('👻 Still ghosting them');
        }
      } catch (err) {
        showNotice(err.message);
      }
    },
    [conversationId, updateConversation, showNotice]
  );

  // ❤️ / 😂 / 👻 to "Should we revive this?"
  const answerRevive = useCallback(
    async (message, answer) => {
      try {
        await api(`/api/conversations/${conversationId}/revive/${message._id}`, { method: 'POST', body: { answer } });
        setMessages((prev) =>
          prev.map((m) => (m._id === message._id ? { ...m, event: { ...m.event, answer } } : m))
        );
        if (answer === 'yes') setCelebration({ emojis: ['🔥', '🧟', '✨'], title: '🔥 Chat revived!' });
      } catch (err) {
        showNotice(err.message);
      }
    },
    [conversationId, showNotice]
  );

  const requestDelete = useCallback((message) => {
    // A message that never reached the server is simply removed
    if (message.failed) {
      if (message.localImage) URL.revokeObjectURL(message.localImage);
      if (message.localMedia) URL.revokeObjectURL(message.localMedia);
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
            m._id === message._id ? { ...m, isDeleted: true, text: '', image: '', media: '', reactions: [] } : m
          )
        );
      }
    } catch (err) {
      showNotice(err.message);
    }
  }

  // ✏️ Encrypts the new text for everyone in the chat, like a new message.
  // Returns true when it was saved (the edit dialog then closes).
  const saveEdit = useCallback(
    async (message, text) => {
      async function encryptAndSave(members) {
        const { encrypted } = await encryptMessage({ conversationId, members, payload: { text } });
        return api(`/api/messages/${message._id}`, { method: 'PATCH', body: encrypted });
      }
      try {
        let result;
        try {
          result = await encryptAndSave(conversationRef.current?.participants || []);
        } catch (err) {
          if (err.code !== 'KEYS_CHANGED') throw err;
          // Someone joined, left or got new keys: refresh and try once more
          const { conversation: fresh } = await api(`/api/conversations/${conversationId}`);
          updateConversation(conversationId, { participants: fresh.participants, otherUser: fresh.otherUser });
          result = await encryptAndSave(fresh.participants);
        }
        const { ciphertext, iv, senderKey, keys, editedAt } = result.message;
        const changes = { text, ciphertext, iv, senderKey, keys, editedAt };
        setMessages((prev) =>
          prev.map((m) => {
            if (m._id === message._id) return { ...m, ...changes };
            if (m.replyTo?._id === message._id) return { ...m, replyTo: { ...m.replyTo, ...changes } };
            return m;
          })
        );
        if (conversationRef.current?.lastMessage?._id === message._id) {
          updateConversation(conversationId, (c) => ({ lastMessage: { ...c.lastMessage, ...changes } }));
        }
        return true;
      } catch (err) {
        showNotice(err.message);
        return false;
      }
    },
    [conversationId, updateConversation, showNotice]
  );

  // 🧹 Empty the chat for me
  async function clearChat() {
    try {
      await api(`/api/conversations/${conversationId}/clear`, { method: 'POST' });
      setMessages([]);
      setHasMore(false);
      updateConversation(conversationId, { lastMessage: null, unreadCount: 0 });
      showNotice('🧹 Chat cleared');
    } catch (err) {
      showNotice(err.message);
    }
  }


  // 🚫 Blocking was taken out of the menu; this only lets a chat that was
  // blocked before that be unblocked again
  async function unblock() {
    try {
      await api(`/api/conversations/${conversationId}/block`, { method: 'DELETE' });
      updateConversation(conversationId, { blockedByMe: false });
      showNotice(`✅ Unblocked ${otherUser?.name}`);
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

  async function unghost() {
    setIsUnghosting(true);
    try {
      await api(`/api/conversations/${conversationId}/ghost`, { method: 'DELETE' });
      updateConversation(conversationId, { ghost: null });
      setCelebration({ emojis: ['🕊️', '✨'], title: '🕊️ Unghosted', subtitle: 'Character development unlocked' });
    } catch (err) {
      showNotice(err.message);
    } finally {
      setIsUnghosting(false);
    }
  }

  // 🧟 "Should we revive this?" on a dead chat
  async function sendRevive() {
    try {
      const { message } = await api(`/api/conversations/${conversationId}/revive`, { method: 'POST' });
      stickToBottom.current = true;
      setMessages((prev) => addOrReplace(prev, message));
    } catch (err) {
      showNotice(err.message);
    }
  }

  // Coming back after "leave conversation"
  async function comeBack() {
    try {
      await api(`/api/conversations/${conversationId}/pause`, { method: 'DELETE' });
      updateConversation(conversationId, { pausedBy: null });
    } catch (err) {
      showNotice(err.message);
    }
  }

  // 👀 "Undo seen": their messages go back to unread, and I stop marking them read
  async function undoSeenNow() {
    setUndoSeen(0);
    try {
      const { unread, remaining } = await api(`/api/conversations/${conversationId}/unread`, { method: 'POST' });
      suppressRead.current = true;
      updateConversation(conversationId, { unreadCount: unread });
      showNotice(`🤫 Unseen · ${remaining} left today`);
    } catch (err) {
      showNotice(err.message);
    }
  }

  async function removeBadge(badge) {
    try {
      await api(`/api/conversations/${conversationId}/badges/${badge._id}`, { method: 'DELETE' });
    } catch (err) {
      showNotice(err.message);
    }
  }

  // 👻 Open a Ghost Click photo or video. A view-once one is marked as opened on
  // the server straight away, so it can't be opened again (not even after a reload).
  const openGhostClick = useCallback(
    async (message) => {
      const mode = message.ghostClick?.mode;
      const isVideo = message.messageType === 'video';
      const file = isVideo ? message.media : message.image;
      if (!file || !message.contentKey) return showNotice('This Ghost Click is no longer available.');
      setGhostView({
        src: '',
        kind: isVideo ? 'video' : 'image',
        mirrored: isVideo && message.mediaMirrored,
        mode,
        caption: message.text,
        senderName: nameOfRef.current(message.senderId, message),
      });
      try {
        const src = isVideo
          ? await decryptMedia(file, message.contentKey, message.mediaType)
          : await decryptImage(file, message.contentKey, message.imageType || 'image/webp');
        if (mode === 'once') {
          await api(`/api/messages/${message._id}/opened`, { method: 'POST' });
          setMessages((prev) =>
            prev.map((m) =>
              m._id === message._id
                ? {
                    ...m,
                    image: '',
                    media: '',
                    ghostClick: { ...m.ghostClick, openedBy: [...(m.ghostClick.openedBy || []), myId] },
                  }
                : m
            )
          );
        }
        setGhostView((view) => view && { ...view, src });
      } catch (err) {
        setGhostView(null);
        showNotice(err.message || 'This Ghost Click is no longer available.');
      }
    },
    [myId, showNotice]
  );

  const closeLightbox = useCallback(() => setLightboxSrc(null), []);
  const closeCelebration = useCallback(() => setCelebration(null), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const closeDeleteDialog = useCallback(() => setDeleting(null), []);
  const closeEditDialog = useCallback(() => setEditing(null), []);

  async function sendMissYou() {
    setIsSendingMissYou(true);
    try {
      const { message } = await api(`/api/conversations/${conversationId}/miss-you`, { method: 'POST' });
      stickToBottom.current = true;
      setMessages((prev) => addOrReplace(prev, message));
      showNotice(`${otherUser?.name?.split(' ')[0] || 'They'} will know you miss them 💕`);
    } catch (err) {
      showNotice(err.message);
    } finally {
      setIsSendingMissYou(false);
    }
  }

  // 📳 Vibrate their phone
  async function sendBuzz() {
    setIsSendingBuzz(true);
    try {
      const { message } = await api(`/api/conversations/${conversationId}/buzz`, { method: 'POST' });
      stickToBottom.current = true;
      setMessages((prev) => addOrReplace(prev, message));
      showNotice(`📳 Buzzed ${otherUser?.name?.split(' ')[0] || 'them'}`);
    } catch (err) {
      showNotice(err.message);
    } finally {
      setIsSendingBuzz(false);
    }
  }

  // A sweet reply from the hearts overlay
  function replyToMissYou(text) {
    setMissYouFrom(null);
    sendMessage(text);
  }

  function writeOwnReply() {
    setMissYouFrom(null);
    rootRef.current?.querySelector('textarea')?.focus();
  }

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

  const presence = otherUser?.isOnline ? 'online' : otherUser ? formatLastSeen(otherUser.lastSeen) : '';
  // 🎭 Their mood goes first: "🧠 overthinking · online"
  const mood = !isGroupChat && MOODS[otherUser?.mood];
  const statusText = typing
    ? typing
    : isGroupChat
      ? memberSummary(conversation, myId)
      : mood
        ? `${mood.emoji} ${mood.label} · ${presence}`
        : presence;
  const statusIsHighlighted = Boolean(typing) || (!isGroupChat && otherUser?.isOnline);
  const badges = conversation?.badges || [];
  // 💖 Nicknames: the one I gave them, and the one they gave me
  const theirNickname = isGroupChat ? '' : nicknameOf(conversation, otherUser?._id);
  const myNickname = isGroupChat ? '' : nicknameOf(conversation, myId);
  const hasPendingRevive = messages.some((m) => m.event?.type === 'revive' && !m.event.answer);

  return (
    <div ref={rootRef} className="mobile-slide-in relative flex h-full min-h-0 flex-1 flex-col bg-panel">
      <header className="brand-header flex h-[4.5rem] shrink-0 items-center gap-1 px-2 md:gap-2 md:px-4">
        <button
          onClick={goBackToList}
          className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 md:w-10 md:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft size={22} />
        </button>
        <button
          type="button"
          // Groups: group info. One-to-one chats: 💖 give them a nickname.
          onClick={() => {
            if (isGroupChat) setShowInfo(true);
            else if (otherUser && !blockedByMe) setDialog('nickname');
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl py-1 text-left"
          aria-label={isGroupChat ? 'Group info' : `Give ${otherUser?.name || 'them'} a nickname`}
          title={isGroupChat ? undefined : 'Tap to give a nickname'}
        >
          {conversation && <ChatAvatar conversation={conversation} size={40} viewable />}
          <div className="min-w-0 flex-1">
            <h2 className="flex min-w-0 items-center gap-1 leading-tight font-semibold text-white">
              <span className="truncate">{conversationTitle(conversation) || '…'}</span>
              {/* 💖 Their real name next to the nickname I gave them */}
              {theirNickname && <span className="shrink-0 text-xs font-normal text-white/70">{otherUser?.name}</span>}
              {!isGroupChat && otherUser && !blockedByMe && <Pencil size={12} className="shrink-0 text-white/60" aria-hidden />}
            </h2>
            <p className={`truncate text-xs ${statusIsHighlighted ? 'text-white' : 'text-white/70'}`}>{statusText}</p>
          </div>
        </button>

        {/* Two dropdowns keep the header tidy: 📞 calls, and ⋮ for everything else */}
        {conversation &&
          (canJoinCall ? (
            <button
              onClick={() => handleCall(activeCall.video)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <PhoneCall size={16} /> Join
            </button>
          ) : (
            <CallMenu disabled={Boolean(currentCall)} onCall={handleCall} />
          ))}
        {conversation && (
          <ChatMenu
            conversation={conversation}
            myId={myId}
            onOpen={setDialog}
            onMissYou={sendMissYou}
            onBuzz={sendBuzz}
            isBusy={isSendingMissYou || isSendingBuzz}
          />
        )}
      </header>

      {/* 🧩 Inside jokes, and 💖 the nickname they gave me */}
      {(badges.length > 0 || myNickname) && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-panel px-3 py-1.5 md:px-4">
          {myNickname && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-pink-100 px-2.5 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-400/15 dark:text-pink-300">
              💖 {otherUser?.name?.split(' ')[0]} calls you “{myNickname}”
            </span>
          )}
          {badges.map((badge) => (
            <span
              key={badge._id}
              className="group flex shrink-0 items-center gap-1 rounded-full border border-line bg-panel-soft py-0.5 pr-1 pl-2.5 text-xs font-medium"
            >
              {badge.emoji} {badge.label}
              <button
                onClick={() => removeBadge(badge)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted opacity-60 hover:bg-hover hover:opacity-100"
                aria-label={`Remove ${badge.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 👀 Just saw their messages? Offer to take the "seen" back for a few seconds.
          It sits above the messages (not on top of them) so the chat stays readable. */}
      <AnimatePresence>
        {undoSeen > 0 && !notice && (
          <motion.div
            key="undo-seen"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative shrink-0 overflow-hidden border-b border-line bg-brand-soft"
            role="status"
          >
            <div className="flex items-center gap-2.5 px-3 py-1.5 md:px-4">
              <motion.span
                className="text-lg"
                animate={{ rotate: [0, -12, 12, -8, 0] }}
                transition={{ duration: 0.7, delay: 0.2 }}
                aria-hidden="true"
              >
                👀
              </motion.span>
              <p className="min-w-0 flex-1 truncate text-sm">
                Seen {undoSeen === 1 ? '1 new message' : `${undoSeen} new messages`}
                <span className="text-muted"> · they’ll know</span>
              </p>
              <button
                onClick={undoSeenNow}
                className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-strong active:scale-95"
              >
                🤫 Undo seen
              </button>
              <button
                onClick={() => setUndoSeen(0)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
            {/* Time left to undo */}
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 bg-brand"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: UNDO_SEEN_MS / 1000, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="chat-bg scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-4 text-fg md:px-[5%] lg:px-[8%]"
        style={backgroundStyle(conversation?.background?.url, conversation?.background?.dim)}
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
                    <EventNote message={message} nameOf={nameOf} myId={myId} onReviveAnswer={answerRevive} />
                  </Fragment>
                );
              }

              // Sent to me after I ghosted them: shown collapsed as "👻 Ghosted"
              const ghostedView =
                ghostedByMe &&
                message.senderId !== myId &&
                !message.forgiveness &&
                new Date(message.createdAt) >= new Date(ghost.since || 0);

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
                    onEdit={setEditing}
                    onDelete={requestDelete}
                    onRetry={retry}
                    onJumpTo={jumpTo}
                    onOpenImage={setLightboxSrc}
                    onOpenGhostClick={openGhostClick}
                    onImageLoad={handleImageLoad}
                    ghostedView={ghostedView}
                    canAnswerForgiveness={
                      ghostedByMe && message.forgiveness?.status === 'pending' && ghost.requestId === message._id
                    }
                    onForgivenessAnswer={answerForgiveness}
                    onReveal={revealReaction}
                  />
                </Fragment>
              );
            })}

            {/* 🫥 They typed for a while, then deleted it (never what they typed) */}
            {almostSaid && !typing && (
              <p className="mt-2.5 text-xs text-muted italic">👻 They typed something... then disappeared.</p>
            )}

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

      {/* 🚪 One of us stepped away */}
      {pausedBy && (
        <div className="shrink-0 border-t border-line bg-panel-soft px-4 py-3 pb-[max(0.75rem,var(--safe-bottom))] text-sm">
          {pausedBy.by === myId ? (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1">You stepped away from this chat. They can’t message you until you’re back.</p>
              <button onClick={comeBack} className="shrink-0 rounded-full bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand-strong">
                Come back
              </button>
            </div>
          ) : (
            <p>
              {(PAUSE_REASONS[pausedBy.reason] || PAUSE_REASONS.space).emoji} {otherUser?.name}{' '}
              {(PAUSE_REASONS[pausedBy.reason] || PAUSE_REASONS.space).note}. You can’t message them right now.
            </p>
          )}
        </div>
      )}

      {/* 🚫 I blocked them */}
      {blockedByMe && !pausedBy && (
        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-panel-soft px-4 py-3 pb-[max(0.75rem,var(--safe-bottom))] text-sm">
          <p className="min-w-0 flex-1">🚫 You blocked {otherUser?.name}. Neither of you can message or call.</p>
          <button
            onClick={unblock}
            className="shrink-0 rounded-full bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand-strong"
          >
            Unblock
          </button>
        </div>
      )}

      {/* 🪦 Dead chat */}
      {isDead && !pausedBy && !blockedByMe && !hasPendingRevive && (
        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-panel-soft px-4 py-2.5 text-sm">
          <p className="min-w-0 flex-1">🪦 This chat is officially dead.</p>
          <button onClick={sendRevive} className="shrink-0 rounded-full bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand-strong">
            🧟 Revive it
          </button>
        </div>
      )}

      {ghost && !pausedBy && !blockedByMe && (
        <GhostBanner
          ghost={ghost}
          myId={myId}
          otherName={otherUser?.name}
          isUnghosting={isUnghosting}
          onUnghost={unghost}
          onChangeLevel={() => setDialog('ghost')}
          onRequest={(text) => sendMessage(text, null, { forgive: true })}
          asFooter={!canType}
        />
      )}

      {canType && (
        <MessageInput
          conversationId={conversationId}
          replyingTo={replyingTo}
          replyName={replyingTo ? (replyingTo.senderId === myId ? 'yourself' : nameOf(replyingTo.senderId)) : ''}
          emojiOnly={emojiOnly}
          onCancelReply={() => setReplyingTo(null)}
          onSendText={sendMessage}
          onCamera={() => setGhostCamera(true)}
          onPickImage={(file) => sendMessage('', file)}
          onSendSticker={(sticker) => sendMessage('', null, { sticker })}
          onSendCustomSticker={sendCustomSticker}
          onOpenStickerStore={() => setDialog('stickers')}
          onSendVoice={(recording) => sendMedia('audio', recording)}
          onError={showNotice}
        />
      )}

      <AnimatePresence>
        {showInfo && isGroupChat && (
          <GroupInfo key="info" conversation={conversation} onClose={() => setShowInfo(false)} />
        )}
        {missYouFrom && (
          <MissYouHearts
            key="miss-you"
            name={missYouFrom}
            onReply={replyToMissYou}
            onWriteOwn={writeOwnReply}
            onClose={() => setMissYouFrom(null)}
          />
        )}
        {celebration && <Celebration key="celebration" {...celebration} onClose={closeCelebration} />}
        {dialog === 'ghost' && conversation && (
          <GhostDialog
            key="ghost-dialog"
            conversation={conversation}
            myId={myId}
            onClose={closeDialog}
            onError={showNotice}
            onChanged={(updated) => updateConversation(conversationId, { ghost: updated })}
          />
        )}
        {dialog === 'leave' && conversation && (
          <LeaveDialog key="leave-dialog" conversation={conversation} onClose={closeDialog} onError={showNotice} onLeft={closeDialog} />
        )}
        {dialog === 'badge' && conversation && (
          <BadgeDialog key="badge-dialog" conversation={conversation} onClose={closeDialog} onError={showNotice} />
        )}
        {dialog === 'vibe' && conversation && <VibePanel key="vibe" conversation={conversation} onClose={closeDialog} />}
        {dialog === 'background' && conversation && (
          <BackgroundDialog key="background-dialog" conversation={conversation} onClose={closeDialog} onError={showNotice} />
        )}
        {dialog === 'nickname' && conversation && (
          <NicknameDialog key="nickname-dialog" conversation={conversation} onClose={closeDialog} onError={showNotice} />
        )}
        {dialog === 'clear' && (
          <ConfirmDialog
            key="clear-dialog"
            title="Clear this chat?"
            text="All messages disappear for you. The other person keeps their copy."
            confirmLabel="Clear chat"
            onConfirm={clearChat}
            onClose={closeDialog}
          />
        )}
        {editing && <EditMessageDialog key="edit-dialog" message={editing} onSave={saveEdit} onClose={closeEditDialog} />}
        {ghostCamera && (
          <GhostClickCamera
            key="ghost-camera"
            onCancel={() => setGhostCamera(false)}
            onError={showNotice}
            // 📷 A photo (tap) or a video (held down), sent as view-once or savable
            onSend={({ kind, file, blob, caption, mode, duration, mirrored }) => {
              setGhostCamera(false);
              if (kind === 'video') sendMedia('video', { blob, duration, mirrored }, { text: caption, ghostClick: mode });
              else sendMessage(caption, file, { ghostClick: mode });
            }}
          />
        )}
        {dialog === 'stickers' && <StickerStore key="sticker-store" onClose={closeDialog} onError={showNotice} />}
        {ghostView && <GhostClickViewer key="ghost-view" {...ghostView} onClose={() => setGhostView(null)} />}
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

// 📞 The call button in the header: it opens a small menu with video and voice,
// so the header isn't crowded with one button per kind of call
function CallMenu({ disabled, onCall }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close it when tapping anywhere else
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

  function call(video) {
    setIsOpen(false);
    onCall(video);
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex h-10 w-9 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white disabled:opacity-40 md:w-10"
        aria-label="Call"
        aria-expanded={isOpen}
      >
        <Phone size={19} />
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12 }}
          className="absolute top-full right-0 z-30 mt-1 w-44 origin-top-right overflow-hidden rounded-2xl border border-line bg-panel py-1 text-sm text-fg shadow-xl"
        >
          <button
            type="button"
            onClick={() => call(true)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover"
          >
            <Video size={17} className="shrink-0" /> Video call
          </button>
          <button
            type="button"
            onClick={() => call(false)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover"
          >
            <Phone size={17} className="shrink-0" /> Voice call
          </button>
        </motion.div>
      )}
    </div>
  );
}

// Group changes, call logs and "miss you" nudges: a small note in the middle of the chat
function EventNote({ message, nameOf, myId, onReviveAnswer }) {
  const event = message.event || {};
  const isCall = event.type === 'call';
  const isMissYou = event.type === 'missYou';
  const isMissed = isCall && !event.duration && String(message.senderId) !== myId;
  const Icon = event.video ? Video : Phone;
  // 🧟 "Should we revive this?" — the other person answers right here
  const canAnswerRevive = event.type === 'revive' && !event.answer && String(message.senderId) !== myId;

  return (
    <div className="my-2 flex flex-col items-center gap-1.5">
      <span
        className={`flex max-w-[85%] items-center gap-1.5 rounded-lg bg-panel/95 px-3 py-1 text-center text-xs shadow-sm ${
          isMissed ? 'text-red-600 dark:text-red-400' : isMissYou ? 'text-rose-600 dark:text-rose-400' : 'text-muted'
        }`}
      >
        {isCall && <Icon size={13} className="shrink-0" />}
        {isMissYou && <Heart size={13} className="shrink-0" fill="currentColor" strokeWidth={0} />}
        {describeEvent(message, nameOf, myId)}
        {(isCall || isMissYou || event.type === 'buzz') &&<span className="opacity-70">· {formatTime(message.createdAt)}</span>}
      </span>
      {canAnswerRevive && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {Object.entries(REVIVE_ANSWERS).map(([answer, info]) => (
            <button
              key={answer}
              onClick={() => onReviveAnswer(message, answer)}
              className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium shadow-sm hover:bg-hover"
            >
              {info.emoji} {info.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
