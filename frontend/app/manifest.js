// Lets the app be added to the Home Screen. On iPhones that's also what makes
// 🔔 push notifications possible: Safari only allows them for installed apps.
export default function manifest() {
  return {
    name: 'Ghost-ed',
    short_name: 'Ghost-ed',
    description: 'End-to-end encrypted messaging, group chats and calls',
    start_url: '/chat',
    display: 'standalone',
    background_color: '#f7e8e2',
    theme_color: '#f7e8e2',
    icons: [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }],
  };
}
