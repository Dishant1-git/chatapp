'use client';

import { LogOut, MessageCircle } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';

// Top bar shown on tablet/desktop only. On mobile the chat list header takes its place.
export default function Navbar() {
  const { user, isConnected, setSidebarPanel, logout } = useChat();

  return (
    <nav className="hidden h-16 shrink-0 items-center justify-between px-4 md:flex lg:px-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
          <MessageCircle size={20} />
        </div>
        <span className="text-lg font-semibold tracking-tight">Chatter</span>
        {!isConnected && (
          <span className="ml-2 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            Reconnecting…
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          onClick={() => setSidebarPanel('profile')}
          className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition hover:bg-hover"
          title="Your profile"
        >
          <Avatar user={user} size={34} />
          <span className="max-w-40 truncate text-sm font-medium">{user?.name}</span>
        </button>
        <button
          onClick={logout}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
          title="Log out"
          aria-label="Log out"
        >
          <LogOut size={19} />
        </button>
      </div>
    </nav>
  );
}
