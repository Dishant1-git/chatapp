'use client';

import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';

// In-app "new message" toasts, shown when the message belongs to a chat you're not viewing
export default function Notifications() {
  const router = useRouter();
  const { toasts, dismissToast } = useChat();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex flex-col items-center gap-2 px-3 md:inset-x-auto md:right-5 md:items-end">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-panel p-3 shadow-lg"
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => {
                dismissToast(toast.id);
                router.push(`/chat/${toast.conversationId}`);
              }}
            >
              <Avatar user={toast.user} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{toast.user?.name}</p>
                <p className="truncate text-sm text-muted">{toast.text}</p>
              </div>
            </button>
            <button
              onClick={() => dismissToast(toast.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
