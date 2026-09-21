'use client';

import { useEffect } from 'react';

// Calls onEscape when the Escape key is pressed (closes dialogs and panels)
export function useEscapeKey(onEscape) {
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onEscape();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onEscape]);
}
