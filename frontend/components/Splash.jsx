'use client';

import Handwriting from './Handwriting';

// The screen while the chats and the encryption key are being unlocked: the
// logo, and the app's name written out by hand.
export default function Splash() {
  return (
    <div
      className="flex h-dvh flex-col items-center justify-center gap-5 px-6"
      role="status"
      aria-label="Loading Ghost-ed"
    >
      <img
        src="/logo-128.webp"
        alt=""
        width={96}
        height={96}
        className="h-24 w-24 rounded-[1.4rem] shadow-lg"
      />
      <Handwriting text="Ghost-ed" speed={95} className="text-5xl font-bold text-brand" ariaLabel="Ghost-ed" />
      <span className="text-sm text-muted">Unlocking your messages…</span>
    </div>
  );
}
