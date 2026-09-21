'use client';

import { motion } from 'framer-motion';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// "Delete message?" dialog. On phones it appears as a bottom sheet.
export default function DeleteDialog({ canDeleteForEveryone, onDeleteForMe, onDeleteForEveryone, onClose }) {
  useEscapeKey(onClose);

  const buttonClass =
    'w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-hover sm:text-right';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        transition={{ type: 'tween', duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:m-4 sm:rounded-2xl"
      >
        <h2 id="delete-title" className="mb-1 text-lg font-semibold">
          Delete message?
        </h2>
        <p className="mb-4 text-sm text-muted">
          {canDeleteForEveryone
            ? 'You can remove it just for you, or for everyone in this chat.'
            : 'This will remove the message from your chat only.'}
        </p>

        <div className="flex flex-col gap-1">
          {canDeleteForEveryone && (
            <button onClick={onDeleteForEveryone} className={`${buttonClass} text-red-600 dark:text-red-400`}>
              Delete for everyone
            </button>
          )}
          <button onClick={onDeleteForMe} className={`${buttonClass} text-red-600 dark:text-red-400`}>
            Delete for me
          </button>
          <button onClick={onClose} className={`${buttonClass} text-brand`}>
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
