'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, logoutAndRedirect } from '@/lib/client';
import { messagePreview } from '@/lib/format';
import { useSocket } from '@/hooks/useSocket';

// Holds everything the chat list and chat window share:
// the logged-in user, the socket, the conversation list, typing state and toasts.
const ChatContext = createContext(null);

export function useChat() {
  return useContext(ChatContext);
}

// A short two-tone "ping" made with the Web Audio API, so no sound file is needed
let audioContext = null;

function unlockAudio() {
  // Browsers only allow sound after the user has interacted with the page
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch {
    audioContext = null;
  }
}

function playNotificationSound() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(1320, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.32);
}

export default function ChatProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeConversationId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;

  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [typingIn, setTypingIn] = useState({}); // { [conversationId]: true }
  const [toasts, setToasts] = useState([]);
  const [sidebarPanel, setSidebarPanel] = useState(null); // null | 'newChat' | 'profile'

  const { socket, isConnected } = useSocket(Boolean(user));

  // Socket handlers are registered once, so they read the latest values from refs
  const userRef = useRef(null);
  const activeIdRef = useRef(null);
  const conversationsRef = useRef([]);
  const notifiedIds = useRef(new Set());
  const typingTimers = useRef({});
  const hasNavigated = useRef(false);
  const firstPath = useRef(pathname);

  useEffect(() => {
    userRef.current = user;
    activeIdRef.current = activeConversationId;
    conversationsRef.current = conversations;
  });

  // Lets the back button use browser history only when there is history to go back to
  useEffect(() => {
    if (pathname !== firstPath.current) hasNavigated.current = true;
  }, [pathname]);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [me, list] = await Promise.all([api('/api/auth/me'), api('/api/conversations')]);
      setUser(me.user);
      setConversations(list.conversations);
    } catch (err) {
      if (err.status === 401 || err.status === 404) {
        logoutAndRedirect();
        return;
      }
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, [loadInitialData]);

  const updateConversation = useCallback((conversationId, changes) => {
    setConversations((prev) =>
      prev.map((c) =>
        c._id === conversationId
          ? { ...c, ...(typeof changes === 'function' ? changes(c) : changes) }
          : c
      )
    );
  }, []);

  const addConversation = useCallback((conversation) => {
    setConversations((prev) =>
      prev.some((c) => c._id === conversation._id) ? prev : [conversation, ...prev]
    );
  }, []);

  const markAsRead = useCallback(
    async (conversationId) => {
      updateConversation(conversationId, { unreadCount: 0 });
      try {
        await api(`/api/conversations/${conversationId}/read`, { method: 'POST' });
      } catch {
        // Not critical — it will be retried the next time the chat is opened
      }
    },
    [updateConversation]
  );

  // Finds or creates the conversation with a user, then opens it
  const openChatWith = useCallback(
    async (otherUserId) => {
      const { conversation } = await api('/api/conversations', {
        method: 'POST',
        body: { userId: otherUserId },
      });
      addConversation(conversation);
      setSidebarPanel(null);
      router.push(`/chat/${conversation._id}`);
    },
    [addConversation, router]
  );

  const goBackToList = useCallback(() => {
    if (hasNavigated.current) router.back();
    else router.replace('/chat');
  }, [router]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Opening a chat clears its notifications
  useEffect(() => {
    if (activeConversationId) {
      setToasts((prev) => prev.filter((t) => t.conversationId !== activeConversationId));
    }
  }, [activeConversationId]);

  const showNotification = useCallback(
    (message, conversation) => {
      // The same message can reach us more than once (reconnects, several events)
      if (notifiedIds.current.has(message._id)) return;
      notifiedIds.current.add(message._id);

      const toast = {
        id: message._id,
        conversationId: message.conversationId,
        user: conversation.otherUser,
        text: messagePreview(message),
      };
      setToasts((prev) => [...prev.slice(-2), toast]); // show at most 3
      setTimeout(() => dismissToast(toast.id), 5000);
      playNotificationSound();
    },
    [dismissToast]
  );

  const setTyping = useCallback((conversationId, isTyping) => {
    clearTimeout(typingTimers.current[conversationId]);
    if (isTyping) {
      // Safety net: hide the indicator if "stopTyping" never arrives
      typingTimers.current[conversationId] = setTimeout(
        () => setTyping(conversationId, false),
        5000
      );
    }
    setTypingIn((prev) => {
      if (Boolean(prev[conversationId]) === isTyping) return prev;
      const next = { ...prev };
      if (isTyping) next[conversationId] = true;
      else delete next[conversationId];
      return next;
    });
  }, []);

  // ---- Socket events that affect the conversation list ----
  useEffect(() => {
    if (!socket) return;

    let hasConnectedBefore = socket.connected;

    function handleConnect() {
      // After a reconnect, reload the list to pick up anything we missed
      if (hasConnectedBefore) {
        api('/api/conversations')
          .then((data) => setConversations(data.conversations))
          .catch(() => {});
      }
      hasConnectedBefore = true;
    }

    function handleNewMessage({ message }) {
      const myId = userRef.current?._id;
      const conversationId = message.conversationId;
      const isMine = message.senderId === myId;
      const isViewing =
        activeIdRef.current === conversationId && document.visibilityState === 'visible';

      const existing = conversationsRef.current.find((c) => c._id === conversationId);

      if (!existing) {
        // Someone started a new chat with us
        api(`/api/conversations/${conversationId}`)
          .then(({ conversation }) => {
            addConversation(conversation);
            if (!isMine && !isViewing) showNotification(message, conversation);
          })
          .catch(() => {});
        return;
      }

      setConversations((prev) => {
        const conv = prev.find((c) => c._id === conversationId);
        if (!conv) return prev;
        const updated = {
          ...conv,
          lastMessage: message,
          lastMessageAt: message.createdAt,
          unreadCount: isMine || isViewing ? conv.unreadCount : conv.unreadCount + 1,
        };
        // Move the conversation to the top
        return [updated, ...prev.filter((c) => c._id !== conversationId)];
      });

      if (!isMine) {
        setTyping(conversationId, false);
        if (!isViewing && !existing.isMuted) showNotification(message, existing);
      }
    }

    function handleMute({ conversationId, isMuted }) {
      updateConversation(conversationId, { isMuted });
    }

    function handleGhost({ conversationId, ghost }) {
      updateConversation(conversationId, { ghost });
    }

    function handlePresence({ userId, isOnline, lastSeen }) {
      setConversations((prev) =>
        prev.map((c) =>
          c.otherUser._id === userId
            ? { ...c, otherUser: { ...c.otherUser, isOnline, lastSeen: lastSeen || c.otherUser.lastSeen } }
            : c
        )
      );
    }

    function handleTyping({ conversationId, userId }) {
      if (userId !== userRef.current?._id) setTyping(conversationId, true);
    }

    function handleStopTyping({ conversationId, userId }) {
      if (userId !== userRef.current?._id) setTyping(conversationId, false);
    }

    function handleDeleted({ messageId, conversationId }) {
      updateConversation(conversationId, (c) =>
        c.lastMessage?._id === messageId
          ? { lastMessage: { ...c.lastMessage, isDeleted: true, text: '', image: '' } }
          : {}
      );
    }

    function handleRead({ conversationId, readerId }) {
      const myId = userRef.current?._id;
      updateConversation(conversationId, (c) => {
        // I read it on another tab or device
        if (readerId === myId) return { unreadCount: 0 };
        if (c.lastMessage?.senderId === myId) {
          return { lastMessage: { ...c.lastMessage, isRead: true, isDelivered: true } };
        }
        return {};
      });
    }

    function handleDelivered({ conversationId, receiverId }) {
      if (receiverId === userRef.current?._id) return;
      updateConversation(conversationId, (c) =>
        c.lastMessage ? { lastMessage: { ...c.lastMessage, isDelivered: true } } : {}
      );
    }

    socket.on('connect', handleConnect);
    socket.on('message:new', handleNewMessage);
    socket.on('presence', handlePresence);
    socket.on('typing', handleTyping);
    socket.on('stopTyping', handleStopTyping);
    socket.on('message:deleted', handleDeleted);
    socket.on('messages:read', handleRead);
    socket.on('messages:delivered', handleDelivered);
    socket.on('conversation:mute', handleMute);
    socket.on('conversation:ghost', handleGhost);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('message:new', handleNewMessage);
      socket.off('presence', handlePresence);
      socket.off('typing', handleTyping);
      socket.off('stopTyping', handleStopTyping);
      socket.off('message:deleted', handleDeleted);
      socket.off('messages:read', handleRead);
      socket.off('messages:delivered', handleDelivered);
      socket.off('conversation:mute', handleMute);
      socket.off('conversation:ghost', handleGhost);
    };
  }, [socket, addConversation, updateConversation, showNotification, setTyping]);

  // Show the unread count in the browser tab, e.g. "(3) Ghosted". Muted chats don't count.
  const totalUnread = conversations.reduce((sum, c) => sum + (c.isMuted ? 0 : c.unreadCount || 0), 0);
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Ghosted` : 'Ghosted';
  }, [totalUnread]);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      socket?.disconnect();
      window.location.href = '/login';
    }
  }, [socket]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      socket,
      isConnected,
      isLoading,
      loadError,
      retryLoad: loadInitialData,
      conversations,
      activeConversationId,
      typingIn,
      toasts,
      dismissToast,
      sidebarPanel,
      setSidebarPanel,
      addConversation,
      updateConversation,
      markAsRead,
      openChatWith,
      goBackToList,
      logout,
    }),
    [
      user,
      socket,
      isConnected,
      isLoading,
      loadError,
      loadInitialData,
      conversations,
      activeConversationId,
      typingIn,
      toasts,
      dismissToast,
      sidebarPanel,
      addConversation,
      updateConversation,
      markAsRead,
      openChatWith,
      goBackToList,
      logout,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
