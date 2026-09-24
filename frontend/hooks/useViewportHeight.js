'use client';

import { useEffect } from 'react';

// A keyboard is open when the visible area is this much shorter than the page
const KEYBOARD_MIN_HEIGHT = 120;

// On iOS Safari the on-screen keyboard doesn't shrink the page ("100dvh" stays
// the same). Instead Safari slides the page up under the keyboard, which pushed
// the message box to the top and left a big gap above the keyboard.
// We follow the visible area with the visualViewport API instead:
// - --app-height: its height, so the app ends right above the keyboard
// - --app-top: how far Safari slid it, so the (fixed) app moves along and stays in view
// - "keyboard-open" on <html>: drops the home-bar padding while the keyboard covers it
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;

    function update() {
      root.style.setProperty('--app-height', `${viewport.height}px`);
      root.style.setProperty('--app-top', `${Math.max(0, viewport.offsetTop)}px`);
      root.classList.toggle('keyboard-open', window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT);
    }

    update();
    // Safari reports the keyboard as a resize and the slide as a scroll, in either order
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-top');
      root.classList.remove('keyboard-open');
    };
  }, []);
}
