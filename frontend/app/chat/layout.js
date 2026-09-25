'use client';

import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { WifiOff } from 'lucide-react';
import { AppSkeleton } from '@/components/Skeleton';
import Splash from '@/components/Splash';
import { handwritingDuration } from '@/components/Handwriting';
import ChatProvider, { useChat } from '@/components/ChatProvider';
import ChatList from '@/components/ChatList';
import Navbar from '@/components/Navbar';
import Notifications from '@/components/Notifications';
// Shown once, on a first visit — no reason to ship it to everyone else
const Tour = dynamicImport(() => import('@/components/Tour'), { ssr: false });
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

// The name is written while the chats load. It never holds the app back: as
// soon as everything is ready the chats appear, part-written name and all.
// This is only how long to keep showing it if the chats are still coming.
const SPLASH_MS = handwritingDuration('Ghost-ed', { speed: 95 }) + 300;

function ChatShell({ children }) {
  const { isLoading, loadError, retryLoad, activeConversationId, keyStatus } = useChat();
  // ✍️ …and if the loading outlasts the writing, the skeleton of the app takes
  // over, so a slow connection doesn't look stuck on the splash.
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const stillLoading = isLoading || (!loadError && keyStatus !== 'ready');
  if (stillLoading && !splashDone && !loadError) return <Splash />;

  // Also shown for the moment it takes to send a device without the encryption
  // key back to the login page (the key is unlocked with the password there)
  if (isLoading || (!loadError && keyStatus !== 'ready')) {
    return <AppSkeleton />;
  }

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff size={36} className="text-muted" />
        <p className="max-w-xs text-muted">{loadError}</p>
        <button
          onClick={retryLoad}
          className="rounded-full bg-brand px-5 py-2 font-medium text-on-brand hover:bg-brand-strong"
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
      {/* Fixed to the visible area, so it stays right above the keyboard on iPhones (see useViewportHeight) */}
      <div className="fixed inset-x-0 top-[var(--app-top,0px)] flex h-[var(--app-height,100dvh)] flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        <Navbar />

        {/* The two panels float as rounded cards on the warm background */}
        <div className="flex min-h-0 flex-1 md:mx-auto md:w-full md:max-w-[1600px] md:gap-4 md:px-4 md:pb-5 lg:px-6 lg:pb-6">
          <aside
            className={`${isChatOpen ? 'hidden md:flex' : 'flex'} w-full min-h-0 flex-col overflow-hidden bg-panel md:w-[340px] md:rounded-3xl md:shadow-xl lg:w-[380px]`}
          >
            <ChatList />
          </aside>

          <main
            className={`${isChatOpen ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel md:rounded-3xl md:shadow-xl`}
          >
            {children}
          </main>
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
