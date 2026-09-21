'use client';

import { useEffect } from 'react';

// On iOS Safari the on-screen keyboard doesn't shrink "100dvh", so the message
// box can end up hidden behind the keyboard. We track the visible area with
// the visualViewport API and expose it as the --app-height CSS variable.
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      document.documentElement.style.setProperty('--app-height', `${viewport.height}px`);
      // iOS scrolls the page up when the keyboard opens; keep it pinned
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    }

    update();
    viewport.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--app-height');
    };
  }, []);
}
