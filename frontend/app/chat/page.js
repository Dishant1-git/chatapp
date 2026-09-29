'use client';

import { Clock, MessageCirclePlus, Phone, Users } from 'lucide-react';
import { useChat } from '@/components/ChatProvider';

// Shown on the right side on desktop when no chat is selected (also after
// pressing Esc in a chat). On mobile this area is hidden and the chat list
// fills the screen.
export default function ChatHome() {
  const { setSidebarPanel } = useChat();

  const actions = [
    { panel: 'newChat', label: 'New chat', Icon: MessageCirclePlus },
    { panel: 'newGroup', label: 'New group', Icon: Users },
    { panel: 'calls', label: 'Calls', Icon: Phone },
    { panel: 'scheduled', label: 'Scheduled', Icon: Clock },
  ];

  return (
    <div className="chat-bg flex flex-1 flex-col items-center justify-center gap-10 overflow-y-auto p-8 text-center">
      <div className="flex w-full max-w-md flex-col items-center rounded-3xl bg-panel-soft px-8 py-10 shadow-sm">
        <Illustration />
        <h2 className="mt-6 text-2xl font-semibold">Your messages</h2>
        <p className="mt-2 max-w-xs text-sm text-muted">
          Pick a conversation from the list, or start a new one.
        </p>
        <button
          onClick={() => setSidebarPanel('newChat')}
          className="mt-6 rounded-full bg-brand px-5 py-2 text-sm font-medium text-on-brand transition hover:bg-brand-strong"
        >
          Start a chat
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-6">
        {actions.map(({ panel, label, Icon }) => (
          <button
            key={panel}
            onClick={() => setSidebarPanel(panel)}
            className="group flex w-20 flex-col items-center gap-2 text-sm"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-panel-soft text-fg transition group-hover:bg-hover">
              <Icon size={22} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// A laptop with an open chat on it, drawn in the theme's colors
function Illustration() {
  return (
    <svg width="160" height="104" viewBox="0 0 160 104" fill="none" aria-hidden="true">
      {/* Laptop base */}
      <rect x="4" y="88" width="152" height="10" rx="5" fill="var(--brand-soft)" />
      <rect x="62" y="88" width="36" height="5" rx="2.5" fill="var(--brand-mid)" />
      {/* Screen */}
      <rect x="20" y="8" width="120" height="80" rx="8" fill="var(--brand-soft)" />
      {/* Chat list panel */}
      <rect x="30" y="16" width="40" height="64" rx="5" fill="var(--brand)" />
      <rect x="37" y="30" width="26" height="3" rx="1.5" fill="var(--on-brand)" />
      <rect x="37" y="40" width="26" height="3" rx="1.5" fill="var(--on-brand)" />
      <rect x="37" y="50" width="26" height="3" rx="1.5" fill="var(--on-brand)" />
      {/* Open chat */}
      <rect x="74" y="16" width="58" height="64" rx="5" fill="var(--panel)" />
      <rect x="80" y="26" width="30" height="10" rx="5" fill="var(--brand-soft)" />
      <rect x="96" y="42" width="30" height="10" rx="5" fill="var(--brand)" />
      <rect x="80" y="58" width="22" height="10" rx="5" fill="var(--brand-soft)" />
    </svg>
  );
}
