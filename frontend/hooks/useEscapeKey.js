'use client';

import { useEffect } from 'react';

// Calls onEscape when the Escape key is pressed (closes dialogs and panels)
export function useEscapeKey(onEscape) {
  useEffect(() => {
    function handleKey(event) {
      if (event.key !== 'Escape') return;
      // Marks the key as used, so the open chat doesn't also close behind this
      event.preventDefault();
      onEscape();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onEscape]);
}
