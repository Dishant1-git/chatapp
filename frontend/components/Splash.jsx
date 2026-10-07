'use client';

import Logo from './Logo';
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
      <Logo size={96} className="rounded-[1.4rem] shadow-lg" />
      <Handwriting text="Ghost-ed" speed={95} className="text-5xl font-bold text-brand" ariaLabel="Ghost-ed" />
      <span className="text-sm text-muted">Unlocking your messages…</span>
    </div>
  );
}
