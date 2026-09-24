'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';
import { api } from '@/lib/client';
import { formatLastSeen } from '@/lib/format';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// "New chat" panel: search all users by name or email and open a conversation
export default function UserSearch({ initialQuery = '', onClose }) {
  const { openChatWith } = useChat();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [error, setError] = useState('');

  // Debounce: wait until the user stops typing for 300ms before searching
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) {
          setResults(data.users);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function handleSelect(userId) {
    setOpeningId(userId);
    try {
      await openChatWith(userId);
    } catch (err) {
      setError(err.message);
      setOpeningId(null);
    }
  }

  return (
    <SidePanel title="New chat" onClose={onClose}>
      <div className="px-3 py-3">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or full email"
            className="w-full rounded-full bg-panel-soft py-2.5 pr-4 pl-10 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/25 md:text-sm"
          />
        </div>
      </div>

      {error && <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {results.map((person) => (
          <li key={person._id}>
            <button
              onClick={() => handleSelect(person._id)}
              disabled={Boolean(openingId)}
              className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-hover disabled:opacity-60"
            >
              <Avatar user={person} size={46} showStatus viewable />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{person.name}</p>
                <p className={`truncate text-sm ${person.isOnline ? 'text-brand' : 'text-muted'}`}>
                  {person.isOnline ? 'online' : formatLastSeen(person.lastSeen)}
                </p>
              </div>
              {openingId === person._id && <Loader2 size={18} className="animate-spin text-muted" />}
            </button>
          </li>
        ))}

        {isSearching && results.length === 0 && (
          <li className="flex justify-center py-10 text-muted">
            <Loader2 size={22} className="animate-spin" />
          </li>
        )}

        {!isSearching && query.trim() && results.length === 0 && !error && (
          <li className="px-8 py-10 text-center text-sm text-muted">No people found for “{query.trim()}”.</li>
        )}

        {!query.trim() && (
          <li className="px-8 py-10 text-center text-sm text-muted">
            Type a name, or their full email address, to find someone.
          </li>
        )}
      </ul>
    </SidePanel>
  );
}

// Panel that slides over the chat list (used by UserSearch and Profile)
export function SidePanel({ title, onClose, children }) {
  useEscapeKey(onClose);

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col bg-panel text-fg"
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-2">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover"
          aria-label="Back"
        >
          <ArrowLeft size={21} />
        </button>
        <h2 className="text-lg font-semibold">{title}</h2>
      </header>
      {children}
    </motion.div>
  );
}
