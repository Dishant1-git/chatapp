'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, logoutAndRedirect } from '@/lib/client';
import { messagePreview } from '@/lib/format';
import { clearDeviceKeys, getSessionKeyId, openMessage, restoreSession } from '@/lib/e2ee';
import { makeNameOf, markDeliveredTo, markReadBy, openConversation } from '@/lib/conversations';
import { playNotificationSound, unlockAudio } from '@/lib/sounds';
import { useSocket } from '@/hooks/useSocket';

// Holds everything the chat list and chat window share: the logged-in user,
// the socket, the conversation list, typing state, toasts and the encryption lock.
const ChatContext = createContext(null);

export function useChat() {
  return useContext(ChatContext);
}

export default function ChatProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeConversationId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;

  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // checking | setup (no keys yet) | locked (PIN needed on this device) | ready
  const [keyStatus, setKeyStatus] = useState('checking');
  const [typingIn, setTypingIn] = useState({}); // { [conversationId]: { [userId]: true } }
  const [toasts, setToasts] = useState([]);
  const [sidebarPanel, setSidebarPanel] = useState(null); // null | 'newChat' | 'newGroup' | 'profile'

  const { socket, isConnected } = useSocket(keyStatus === 'ready');

  // Socket handlers are registered once, so they read the latest values from refs
  const userRef = useRef(null);
  const activeIdRef = useRef(null);
  const conversationsRef = useRef([]);
  const notifiedIds = useRef(new Set());
  const typingTimers = useRef({});
  const hasNavigated = useRef(false);
  const firstPath = useRef(pathname);
  // Incoming messages are decrypted one after another so they stay in order
  const messageQueue = useRef(Promise.resolve());

  useEffect(() => {
    userRef.current = user;
    activeIdRef.current = activeConversationId;
    conversationsRef.current = conversations;
  });

  // Lets the back button use browser history only when there is history to go back to
  useEffect(() => {
    if (pathname !== firstPath.current) hasNavigated.current = true;
  }, [pathname]);

  const loadConversations = useCallback(async () => {
    const list = await api('/api/conversations');
    setConversations(await Promise.all(list.conversations.map(openConversation)));
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const me = await api('/api/auth/me');
      setUser(me.user);
      if (await restoreSession(me.user)) {
        await loadConversations();
        setKeyStatus('ready');
      } else {
        setKeyStatus(me.user.publicKey ? 'locked' : 'setup');
      }
    } catch (err) {
      if (err.status === 401 || err.status === 404) {
        logoutAndRedirect();
        return;
      }
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [loadConversations]);

  useEffect(() => {
    loadInitialData();
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, [loadInitialData]);

  // Called by the PIN screen once the keys are unlocked (or newly created)
  const onKeysReady = useCallback(
    async (updatedUser) => {
      if (updatedUser) setUser(updatedUser);
      setIsLoading(true);
      try {
        await loadConversations();
        setKeyStatus('ready');
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [loadConversations]
  );

  const updateConversation = useCallback((conversationId, changes) => {
    setConversations((prev) =>
      prev.map((c) =>
        c._id === conversationId
          ? { ...c, ...(typeof changes === 'function' ? changes(c) : changes) }
          : c
      )
    );
  }, []);

  const addConversation = useCallback(async (conversation) => {
    const opened = await openConversation(conversation);
    setConversations((prev) => (prev.some((c) => c._id === opened._id) ? prev : [opened, ...prev]));
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
      await addConversation(conversation);
      setSidebarPanel(null);
      router.push(`/chat/${conversation._id}`);
    },
    [addConversation, router]
  );

  const createGroup = useCallback(
    async ({ name, memberIds, image }) => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('members', JSON.stringify(memberIds));
      if (image) formData.append('image', image);
      const { conversation } = await api('/api/conversations/groups', { method: 'POST', formData });
      await addConversation(conversation);
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

      const myId = userRef.current?._id;
      const nameOf = makeNameOf(conversation, myId);
      const isGroupChat = conversation.type === 'group';
      const preview = messagePreview(message, { nameOf, myId });

      const toast = {
        id: message._id,
        conversationId: message.conversationId,
        conversation,
        title: isGroupChat ? conversation.name : conversation.otherUser?.name,
        text: isGroupChat && message.messageType !== 'event' ? `${nameOf(message.senderId)}: ${preview}` : preview,
      };
      setToasts((prev) => [...prev.slice(-2), toast]); // show at most 3
      setTimeout(() => dismissToast(toast.id), 5000);
      playNotificationSound();
    },
    [dismissToast]
  );

  const setTyping = useCallback((conversationId, userId, isTyping) => {
    const timerKey = `${conversationId}:${userId}`;
    clearTimeout(typingTimers.current[timerKey]);
    if (isTyping) {
      // Safety net: hide the indicator if "stopTyping" never arrives
      typingTimers.current[timerKey] = setTimeout(() => setTyping(conversationId, userId, false), 5000);
    }
    setTypingIn((prev) => {
      const current = prev[conversationId] || {};
      if (Boolean(current[userId]) === isTyping) return prev;
      const people = { ...current };
      if (isTyping) people[userId] = true;
      else delete people[userId];
      const next = { ...prev };
      if (Object.keys(people).length) next[conversationId] = people;
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
      if (hasConnectedBefore) loadConversations().catch(() => {});
      hasConnectedBefore = true;
    }

    async function processNewMessage(rawMessage) {
      const myId = userRef.current?._id;
      const conversationId = rawMessage.conversationId;
      const message = await openMessage(rawMessage);
      const isMine = message.senderId === myId;
      const isForMe = (message.recipients || []).includes(myId);
      const isViewing = activeIdRef.current === conversationId && document.visibilityState === 'visible';

      const existing = conversationsRef.current.find((c) => c._id === conversationId);

      if (!existing) {
        // Someone started a chat with us, or added us to a group
        try {
          const { conversation } = await api(`/api/conversations/${conversationId}`);
          const opened = await openConversation(conversation);
          setConversations((prev) => (prev.some((c) => c._id === opened._id) ? prev : [opened, ...prev]));
          if (isForMe && !isViewing) showNotification(message, opened);
        } catch {
          // Not a member (anymore) — ignore
        }
        return;
      }

      setConversations((prev) => {
        const conv = prev.find((c) => c._id === conversationId);
        if (!conv) return prev;
        const updated = {
          ...conv,
          lastMessage: message,
          lastMessageAt: message.createdAt,
          unreadCount: isForMe && !isViewing ? conv.unreadCount + 1 : conv.unreadCount,
        };
        // Move the conversation to the top
        return [updated, ...prev.filter((c) => c._id !== conversationId)];
      });

      if (!isMine) {
<<<<<<< Updated upstream
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
=======
        setTyping(conversationId, message.senderId, false);
        if (isForMe && !isViewing) showNotification(message, existing);
      }
    }

    function handleNewMessage({ message }) {
      messageQueue.current = messageQueue.current.then(() => processNewMessage(message)).catch(() => {});
    }

    function updateMember(userId, changes) {
>>>>>>> Stashed changes
      setConversations((prev) =>
        prev.map((c) => {
          if (!c.participants?.some((p) => p._id === userId)) return c;
          const participants = c.participants.map((p) => (p._id === userId ? { ...p, ...changes } : p));
          const otherUser = c.otherUser?._id === userId ? { ...c.otherUser, ...changes } : c.otherUser;
          return { ...c, participants, otherUser };
        })
      );
    }

    function handlePresence({ userId, isOnline, lastSeen }) {
      updateMember(userId, lastSeen ? { isOnline, lastSeen } : { isOnline });
    }

    // Someone set up or reset their encryption keys
    function handleKeysChanged({ userId, publicKey, keyId }) {
      // I reset my PIN on another device: the key on this one is outdated, so unlock again
      if (userId === userRef.current?._id && keyId !== getSessionKeyId()) {
        clearDeviceKeys().finally(() => {
          setUser((u) => ({ ...u, publicKey, keyId }));
          setKeyStatus('locked');
        });
        return;
      }
      updateMember(userId, { publicKey, keyId });
    }

    function handleTyping({ conversationId, userId }) {
      if (userId !== userRef.current?._id) setTyping(conversationId, userId, true);
    }

    function handleStopTyping({ conversationId, userId }) {
      if (userId !== userRef.current?._id) setTyping(conversationId, userId, false);
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
        if (c.lastMessage?.senderId === myId) return { lastMessage: markReadBy(c.lastMessage, readerId) };
        return {};
      });
    }

    function handleDelivered({ conversationId, receiverId }) {
      if (receiverId === userRef.current?._id) return;
      updateConversation(conversationId, (c) =>
        c.lastMessage ? { lastMessage: markDeliveredTo(c.lastMessage, receiverId) } : {}
      );
    }

    // A group's name, photo, members or admins changed
    function handleConversationUpdated({ conversation }) {
      updateConversation(conversation._id, conversation);
    }

    // I was removed from a group
    function handleConversationRemoved({ conversationId }) {
      setConversations((prev) => prev.filter((c) => c._id !== conversationId));
      if (activeIdRef.current === conversationId) router.replace('/chat');
    }

    socket.on('connect', handleConnect);
    socket.on('message:new', handleNewMessage);
    socket.on('presence', handlePresence);
    socket.on('keys:changed', handleKeysChanged);
    socket.on('typing', handleTyping);
    socket.on('stopTyping', handleStopTyping);
    socket.on('message:deleted', handleDeleted);
    socket.on('messages:read', handleRead);
    socket.on('messages:delivered', handleDelivered);
<<<<<<< Updated upstream
    socket.on('conversation:mute', handleMute);
    socket.on('conversation:ghost', handleGhost);
=======
    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('conversation:removed', handleConversationRemoved);
>>>>>>> Stashed changes

    return () => {
      socket.off('connect', handleConnect);
      socket.off('message:new', handleNewMessage);
      socket.off('presence', handlePresence);
      socket.off('keys:changed', handleKeysChanged);
      socket.off('typing', handleTyping);
      socket.off('stopTyping', handleStopTyping);
      socket.off('message:deleted', handleDeleted);
      socket.off('messages:read', handleRead);
      socket.off('messages:delivered', handleDelivered);
<<<<<<< Updated upstream
      socket.off('conversation:mute', handleMute);
      socket.off('conversation:ghost', handleGhost);
=======
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('conversation:removed', handleConversationRemoved);
>>>>>>> Stashed changes
    };
  }, [socket, router, loadConversations, updateConversation, showNotification, setTyping]);

  // Show the unread count in the browser tab, e.g. "(3) Ghosted". Muted chats don't count.
  const totalUnread = conversations.reduce((sum, c) => sum + (c.isMuted ? 0 : c.unreadCount || 0), 0);
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Ghosted` : 'Ghosted';
  }, [totalUnread]);

  const logout = useCallback(async () => {
    try {
      await clearDeviceKeys();
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
      keyStatus,
      onKeysReady,
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
      createGroup,
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
      keyStatus,
      onKeysReady,
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
      createGroup,
      goBackToList,
      logout,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
