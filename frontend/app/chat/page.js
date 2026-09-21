import { MessageCircle } from 'lucide-react';

// Shown on the right side on desktop when no chat is selected.
// (On mobile this area is hidden and the chat list fills the screen.)
export default function ChatHome() {
  return (
    <div className="chat-bg flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-soft text-brand">
        <MessageCircle size={40} />
      </div>
      <h2 className="text-xl font-semibold">Your messages</h2>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Pick a conversation from the list, or start a new one with the pencil button.
      </p>
    </div>
  );
}
