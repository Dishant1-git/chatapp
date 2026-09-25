'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ className = '' }) {
  const [isDark, setIsDark] = useState(false);

  // The <html> class was already set by the script in app/layout.js
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Private browsing can block localStorage — the toggle still works for this visit
    }
    setIsDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // It always sits on a header strip (the top bar, or the list header)
      className={`flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
