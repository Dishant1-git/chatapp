'use client';

import { useEffect } from 'react';

// 🛡️ Keeps the casual visitor out of the browser's developer tools: the usual
// shortcuts (F12, Ctrl+Shift+I / J / C, Ctrl+U and their Mac versions) and the
// right-click "Inspect" do nothing.
//
// It's a closed door, not a locked one. The tools can still be opened from the
// browser's own menu, and no web page can prevent that — so nothing here is
// what keeps anything safe. What protects messages is that they're encrypted
// and that the server checks every request (see ARCHITECTURE.md §13).
//
// Only in production builds, so the app can still be worked on.
export default function Shield() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    function onKeyDown(event) {
      const key = event.key?.toLowerCase();
      const opensTools =
        key === 'f12' ||
        (event.ctrlKey && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
        (event.metaKey && event.altKey && ['i', 'j', 'c', 'u'].includes(key)) ||
        (event.ctrlKey && !event.shiftKey && key === 'u');
      if (opensTools) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    // The app's own right-click menus (a chat, a message) are React handlers and
    // still open. Text boxes keep the browser's menu: that's where Paste lives.
    function onContextMenu(event) {
      if (event.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return null;
}
