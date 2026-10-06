'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Search, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import { ChatAvatar } from './Avatar';
import { conversationTitle, isGroup } from '@/lib/conversations';
import { messagePreview } from '@/lib/format';
import { MAX_FORWARD_CHATS, canCaptionForward, canForwardTo, forwardMessage } from '@/lib/forward';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// ↪️ Pick the chats a message is forwarded to. It's encrypted again for each
// of them in this browser (see lib/forward.js).
// onSent(conversationId, message) is called for every copy that went out.
export default function ForwardDialog({ message, onClose, onSent, onNotice }) {
  const { user, conversations } = useChat();
  const myId = user._id;
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]); // conversation ids
  const [busy, setBusy] = useState(false);
  // A photo's caption can be written or changed on the way out
  const withCaption = canCaptionForward(message);
  const [caption, setCaption] = useState(message.text || '');
  useEscapeKey(busy ? () => {} : onClose);

  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => canForwardTo(c, myId))
      .filter((c) => !q || conversationTitle(c).toLowerCase().includes(q));
  }, [conversations, myId, query]);

  function toggle(id) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_FORWARD_CHATS) {
        onNotice(`You can forward to ${MAX_FORWARD_CHATS} chats at a time.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function forward() {
    setBusy(true);
    const failed = [];
    let lastError = '';
    for (const id of picked) {
      const conversation = conversations.find((c) => c._id === id);
      try {
        const saved = await forwardMessage(message, conversation, withCaption ? { caption: caption.trim() } : {});
        onSent(id, saved);
      } catch (err) {
        failed.push(conversationTitle(conversation));
        lastError = err.message;
      }
    }
    if (!failed.length) onNotice(picked.length > 1 ? `↪️ Forwarded to ${picked.length} chats` : '↪️ Forwarded');
    else if (failed.length === 1) onNotice(`Couldn't forward to ${failed[0]}: ${lastError}`);
    else onNotice(`Couldn't forward to ${failed.length} chats: ${lastError}`);
    onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={busy ? undefined : onClose}
    >
      <motion.div
        role="dialog"
        aria-label="Forward message"
        className="flex max-h-[85dvh] w-full max-w-sm flex-col rounded-t-3xl bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Forward to…</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="private mb-3 truncate rounded-lg border-l-4 border-brand bg-panel-soft px-3 py-1.5 text-sm text-muted">
          {messagePreview(message, { myId })}
        </p>

        <label className="mb-2 flex items-center gap-2 rounded-full border border-line bg-panel-soft px-3.5 py-2">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted md:text-sm"
          />
        </label>

        <ul className="scroll-thin -mx-2 min-h-24 flex-1 overflow-y-auto">
          {chats.map((c) => {
            const selected = picked.includes(c._id);
            return (
              <li key={c._id}>
                <button
                  type="button"
                  onClick={() => toggle(c._id)}
                  disabled={busy}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                    selected ? 'bg-brand-soft' : 'hover:bg-hover'
                  }`}
                >
                  <ChatAvatar conversation={c} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{conversationTitle(c)}</span>
                    {isGroup(c) && <span className="block text-xs text-muted">Group</span>}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected ? 'border-brand bg-brand text-on-brand' : 'border-line'
                    }`}
                  >
                    {selected && <Check size={13} />}
                  </span>
                </button>
              </li>
            );
          })}
          {!chats.length && <li className="px-3 py-6 text-center text-sm text-muted">No chats found.</li>}
        </ul>

        {withCaption && (
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={busy}
            placeholder="Add a caption…"
            aria-label="Caption"
            className="mt-3 w-full rounded-full border border-line bg-panel-soft px-4 py-2 text-base outline-none placeholder:text-muted md:text-sm"
          />
        )}

        <button
          onClick={forward}
          disabled={busy || !picked.length}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-2.5 font-medium text-on-brand hover:bg-brand-strong disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? 'Forwarding…' : picked.length > 1 ? `Forward to ${picked.length} chats` : 'Forward'}
        </button>
      </motion.div>
    </motion.div>
  );
}
