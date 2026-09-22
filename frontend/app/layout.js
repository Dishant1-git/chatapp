import './globals.css';
import { ACCESSIBILITY_SCRIPT } from '@/lib/accessibility';

export const metadata = {
  title: 'Ghosted',
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#11171e' },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + ACCESSIBILITY_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
