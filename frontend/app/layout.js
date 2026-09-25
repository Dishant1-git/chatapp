import { Dancing_Script } from 'next/font/google';
import './globals.css';
import { ACCESSIBILITY_SCRIPT } from '@/lib/accessibility';

// The handwriting on the loading screen and the login page. Downloaded at build
// time and served from our own domain, so no request goes to Google at runtime.
const handwriting = Dancing_Script({
  subsets: ['latin'],
  weight: ['500', '700'],
  // globals.css turns this into the `font-hand` utility, with fallbacks
  variable: '--font-hand-family',
});

export const metadata = {
  title: 'Ghost-ed',
  description: 'End-to-end encrypted messaging, group chats and calls',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // On Android Chrome, shrink the page when the keyboard opens so the
  // message box stays visible above it
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7e8e2' },
    { media: '(prefers-color-scheme: dark)', color: '#100c0b' },
  ],
};

// Runs before the page paints so dark mode users don't see a white flash
const themeScript = `
try {
  var theme = localStorage.getItem('theme');
  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={handwriting.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + ACCESSIBILITY_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
