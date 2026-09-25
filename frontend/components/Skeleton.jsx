// ⏳ Loading placeholders. They copy the shape of what's coming (rows, bubbles),
// so the screen doesn't jump once the real thing arrives. The shimmer itself is
// the .skeleton class in globals.css.

export default function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

// People results: search, the group member picker
export function PeopleSkeleton({ rows = 4 }) {
  const widths = ['62%', '48%', '70%', '55%', '44%'];
  return (
    <ul className="pt-1" role="status" aria-label="Searching">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="mx-2 flex items-center gap-3 rounded-xl px-2.5 py-2.5">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24 rounded-full" />
            <Skeleton className="h-3 rounded-full" style={{ width: widths[i % widths.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// A grid of pictures: the GIF picker
export function TileGridSkeleton({ tiles = 8, className = 'grid grid-cols-3 gap-2 sm:grid-cols-4' }) {
  return (
    <div className={className} role="status" aria-label="Loading">
      {Array.from({ length: tiles }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

// Sticker packs in the store: cover, name, line of stickers
export function PackListSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading sticker packs">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-28 rounded-full" />
            <Skeleton className="h-3 w-20 rounded-full" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// The numbers in "Read the vibe"
export function StatsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Working out the vibe">
      <Skeleton className="mx-auto h-6 w-40 rounded-full" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-xl" />
    </div>
  );
}

// A picture, video or voice note while it downloads and is decrypted
export function MediaSkeleton({ ratio, className = '' }) {
  return <Skeleton className={`w-full ${className}`} style={{ aspectRatio: ratio || '4 / 3' }} />;
}

// One row of the conversation list: picture, name, last message, time
function ChatRowSkeleton({ width }) {
  return (
    <li className="mx-2 flex items-center gap-3 rounded-2xl px-3 py-3">
      <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-28 rounded-full" />
        <Skeleton className="h-3 rounded-full" style={{ width }} />
      </div>
      <Skeleton className="h-3 w-10 shrink-0 rounded-full" />
    </li>
  );
}

// The chat list while conversations are loading
export function ChatListSkeleton() {
  const widths = ['70%', '55%', '80%', '45%', '65%', '75%', '50%'];
  return (
    <div className="brand-header flex h-full min-h-0 flex-col overflow-hidden" role="status" aria-label="Loading chats">
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 pt-1">
        <Skeleton className="h-6 w-32 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </header>
      <div className="px-3 pb-2">
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
      <ul className="surface mt-1 min-h-0 flex-1 overflow-hidden rounded-t-[2rem] pt-3">
        <li className="px-5 pb-1">
          <Skeleton className="h-5 w-20 rounded-full" />
        </li>
        {widths.map((width, i) => (
          <ChatRowSkeleton key={i} width={width} />
        ))}
      </ul>
    </div>
  );
}

// A chat while its messages are being fetched and decrypted
export function MessagesSkeleton() {
  // Left/right and how wide, so it reads like a real conversation
  const bubbles = [
    { mine: false, w: '58%', h: 'h-10' },
    { mine: true, w: '42%', h: 'h-10' },
    { mine: false, w: '70%', h: 'h-16' },
    { mine: true, w: '52%', h: 'h-10' },
    { mine: true, w: '36%', h: 'h-10' },
    { mine: false, w: '64%', h: 'h-14' },
  ];
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 p-4" role="status" aria-label="Loading messages">
      <div className="mb-1 flex justify-center">
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      {bubbles.map((bubble, i) => (
        <div key={i} className={`flex ${bubble.mine ? 'justify-end' : 'justify-start'}`}>
          <Skeleton className={`${bubble.h} rounded-2xl`} style={{ width: bubble.w }} />
        </div>
      ))}
    </div>
  );
}

// The whole app while the conversations and the encryption key load
export function AppSkeleton() {
  return (
    <div className="fixed inset-x-0 top-[var(--app-top,0px)] flex h-[var(--app-height,100dvh)] flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
      <div className="hidden h-16 shrink-0 items-center justify-between px-4 md:flex lg:px-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>

      <div className="flex min-h-0 flex-1 md:mx-auto md:w-full md:max-w-[1600px] md:gap-4 md:px-4 md:pb-5 lg:px-6 lg:pb-6">
        <aside className="flex w-full min-h-0 flex-col overflow-hidden bg-panel md:w-[340px] md:rounded-3xl md:shadow-xl lg:w-[380px]">
          <ChatListSkeleton />
        </aside>
        <main className="hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel md:flex md:rounded-3xl md:shadow-xl">
          <div className="brand-header flex h-[4.5rem] shrink-0 items-center gap-3 px-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-36 rounded-full" />
              <Skeleton className="h-3 w-20 rounded-full" />
            </div>
          </div>
          <div className="chat-bg flex min-h-0 flex-1 flex-col">
            <MessagesSkeleton />
          </div>
        </main>
      </div>
    </div>
  );
}
