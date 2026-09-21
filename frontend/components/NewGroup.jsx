'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Camera, Check, Loader2, Search, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';
import { SidePanel } from './UserSearch';
import { checkImageFile } from './ImagePreview';
import { api } from '@/lib/client';

// "New group" panel: pick people, then name the group
export default function NewGroup({ onClose }) {
  const { createGroup } = useChat();
  const [step, setStep] = useState('members'); // members | details
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function handleImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return setError(problem);
    setError('');
    setImage(file);
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!name.trim()) return setError('Please give the group a name.');
    setIsCreating(true);
    setError('');
    try {
      await createGroup({ name: name.trim(), memberIds: selected.map((p) => p._id), image });
    } catch (err) {
      setError(err.message);
      setIsCreating(false);
    }
  }

  if (step === 'members') {
    return (
      <SidePanel title="Add group members" onClose={onClose}>
        <PeoplePicker selected={selected} onChange={setSelected} />
        <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setStep('details')}
            disabled={selected.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-white transition hover:bg-brand-strong disabled:opacity-40"
          >
            Next <ArrowRight size={18} />
          </button>
        </div>
      </SidePanel>
    );
  }

  return (
    <SidePanel title="New group" onClose={() => setStep('members')}>
      <form onSubmit={handleCreate} className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-8 pb-4">
          <label className="group relative cursor-pointer" title="Add a group photo (optional)">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-panel-soft text-muted transition group-hover:border-brand">
              {imageUrl ? (
                <img src={imageUrl} alt="Group photo" className="h-full w-full object-cover" />
              ) : (
                <Camera size={26} />
              )}
            </div>
            <span className="mt-1 block text-center text-xs text-muted">{image ? 'Change photo' : 'Add photo'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} className="sr-only" />
          </label>
        </div>

        <div className="px-5">
          <label className="mb-1.5 block text-sm font-medium text-brand">Group name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Weekend trip"
            className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
          />
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <p className="mt-6 px-5 text-sm font-medium text-muted">Members: {selected.length + 1}</p>
        <ul className="mt-2 flex flex-wrap gap-2 px-5">
          {selected.map((person) => (
            <li key={person._id} className="flex items-center gap-1.5 rounded-full bg-panel-soft py-1 pr-3 pl-1 text-sm">
              <Avatar user={person} size={24} />
              {person.name}
            </li>
          ))}
        </ul>

        <div className="mt-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-white transition hover:bg-brand-strong disabled:opacity-40"
          >
            {isCreating ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Create group
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

// Search people and tick several of them. People you already chat with are
// suggested before you type. `exclude` hides ids (e.g. current group members).
export function PeoplePicker({ selected, onChange, exclude = [] }) {
  const { conversations } = useChat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const suggestions = useMemo(
    () => conversations.filter((c) => c.type !== 'group' && c.otherUser).map((c) => c.otherUser),
    [conversations]
  );

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

  const people = (query.trim() ? results : suggestions).filter((p) => !exclude.includes(p._id));
  const isSelected = (person) => selected.some((p) => p._id === person._id);

  function toggle(person) {
    onChange(isSelected(person) ? selected.filter((p) => p._id !== person._id) : [...selected, person]);
  }

  return (
    <>
      {selected.length > 0 && (
        <ul className="flex shrink-0 gap-3 overflow-x-auto px-4 pt-3 pb-1">
          {selected.map((person) => (
            <li key={person._id} className="w-14 shrink-0 text-center">
              <button type="button" onClick={() => toggle(person)} className="relative" aria-label={`Remove ${person.name}`}>
                <Avatar user={person} size={48} />
                <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-panel bg-muted text-panel">
                  <X size={11} strokeWidth={3} />
                </span>
              </button>
              <p className="truncate text-[11px] text-muted">{person.name.split(' ')[0]}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="shrink-0 px-3 py-3">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
            className="w-full rounded-full bg-panel-soft py-2.5 pr-4 pl-10 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/25 md:text-sm"
          />
        </div>
      </div>

      {error && <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {!query.trim() && people.length > 0 && (
          <li className="px-5 pb-1 text-xs font-medium tracking-wide text-muted uppercase">People you chat with</li>
        )}
        {people.map((person) => (
          <li key={person._id}>
            <button
              type="button"
              onClick={() => toggle(person)}
              className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-hover"
            >
              <Avatar user={person} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{person.name}</p>
                <p className="truncate text-sm text-muted">{person.email}</p>
              </div>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  isSelected(person) ? 'border-brand bg-brand text-white' : 'border-line'
                }`}
              >
                {isSelected(person) && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          </li>
        ))}

        {isSearching && results.length === 0 && (
          <li className="flex justify-center py-10 text-muted">
            <Loader2 size={22} className="animate-spin" />
          </li>
        )}
        {!isSearching && query.trim() && people.length === 0 && !error && (
          <li className="px-8 py-10 text-center text-sm text-muted">No people found for “{query.trim()}”.</li>
        )}
        {!query.trim() && people.length === 0 && (
          <li className="px-8 py-10 text-center text-sm text-muted">Type a name or email address to find people.</li>
        )}
      </ul>
    </>
  );
}
