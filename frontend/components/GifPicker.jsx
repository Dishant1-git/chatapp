'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { TileGridSkeleton } from './Skeleton';
import { api } from '@/lib/client';

// 🎞️ GIF search (GIPHY, proxied by our own server). The tab only appears when
// the server has a GIPHY_API_KEY; without one this reports "unavailable" and
// the tab stays hidden.

export default function GifPicker({ onPick, onError, onUnavailable }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState(null);
  const [busyId, setBusyId] = useState('');
  const inputRef = useRef(null);

  // Trending at first, then whatever is typed (after a short pause)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const { gifs: found } = await api(`/api/gifs?q=${encodeURIComponent(query)}`);
          if (!cancelled) setGifs(found);
        } catch (err) {
          if (cancelled) return;
          setGifs([]);
          if (err.code === 'NO_GIF_KEY' || err.status === 503) onUnavailable();
          else onError(err.message);
        }
      },
      query ? 400 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, onError, onUnavailable]);

  async function pick(gif) {
    setBusyId(gif.id);
    try {
      const response = await fetch(`/api/gifs/file?url=${encodeURIComponent(gif.url)}`);
      if (!response.ok) throw new Error("Couldn't download that GIF.");
      const blob = await response.blob();
      onPick(new File([blob], 'gif.gif', { type: blob.type || 'image/gif' }));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="px-3">
      <div className="relative mb-1.5">
        <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs"
          className="w-full rounded-full bg-panel-soft py-2 pr-3 pl-9 text-base outline-none placeholder:text-muted md:text-sm"
        />
      </div>

      <div className="scroll-thin grid max-h-44 grid-cols-3 gap-1 overflow-y-auto sm:grid-cols-4">
        {gifs === null ? (
          <div className="col-span-full">
            <TileGridSkeleton tiles={8} className="grid grid-cols-3 gap-1 sm:grid-cols-4" />
          </div>
        ) : gifs.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted">No GIFs found.</p>
        ) : (
          gifs.map((gif) => (
            <button
              key={gif.id}
              type="button"
              onClick={() => pick(gif)}
              disabled={Boolean(busyId)}
              className="relative overflow-hidden rounded-xl bg-panel-soft transition active:scale-95 disabled:opacity-60"
              aria-label={`Send GIF: ${gif.title}`}
            >
              <img src={gif.preview} alt="" className="h-20 w-full object-cover" draggable={false} />
              {busyId === gif.id && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 className="animate-spin" size={18} />
                </span>
              )}
            </button>
          ))
        )}
      </div>
      <p className="py-1 text-center text-[10px] text-muted">GIFs by GIPHY</p>
    </div>
  );
}
