'use client';

import { Loader2, WifiOff } from 'lucide-react';
import ChatProvider, { useChat } from '@/components/ChatProvider';
import ChatList from '@/components/ChatList';
import Navbar from '@/components/Navbar';
import Notifications from '@/components/Notifications';
import Tour from '@/components/Tour';
import ProfileViewer from '@/components/ProfileViewer';
import CallProvider from '@/components/CallProvider';
import { useViewportHeight } from '@/hooks/useViewportHeight';

// This layout stays mounted while you switch between chats, so the socket
// connection and the conversation list are kept alive.
export default function ChatLayout({ children }) {
  useViewportHeight();

  return (
    <ChatProvider>
      <ChatShell>{children}</ChatShell>
    </ChatProvider>
  );
}

function ChatShell({ children }) {
  const { isLoading, loadError, retryLoad, activeConversationId, keyStatus } = useChat();

  // Also shown for the moment it takes to send a device without the encryption
  // key back to the login page (the key is unlocked with the password there)
  if (isLoading || (!loadError && keyStatus !== 'ready')) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff size={36} className="text-muted" />
        <p className="max-w-xs text-muted">{loadError}</p>
        <button
          onClick={retryLoad}
          className="rounded-full bg-brand px-5 py-2 font-medium text-white hover:bg-brand-strong"
        >
          Try again
        </button>
      </div>
    );
  }

  // On mobile only one screen is shown at a time: the list, or the open chat.
  // On desktop (md and up) both are shown side by side.
  const isChatOpen = Boolean(activeConversationId);

  return (
    // CallProvider shows the incoming-call and in-call screens on top of everything
    <CallProvider>
      <div className="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:bg-app">
        <Navbar />

        <div className="flex min-h-0 flex-1 md:mx-auto md:w-full md:max-w-[1600px] md:px-4 md:pb-4 lg:px-6 lg:pb-6">
          <div className="flex min-h-0 flex-1 overflow-hidden md:rounded-2xl md:border md:border-line md:shadow-sm">
            <aside
              className={`${isChatOpen ? 'hidden md:flex' : 'flex'} w-full flex-col bg-panel md:w-[340px] md:border-r md:border-line lg:w-[380px]`}
            >
              <ChatList />
            </aside>

            <main className={`${isChatOpen ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
              {children}
            </main>
          </div>
        </div>

        <Notifications />
        {/* Tap anyone's picture to see it bigger, with their profile */}
        <ProfileViewer />
        {/* First-time guided tour of the features */}
        <Tour />
      </div>
    </CallProvider>
  );
}
