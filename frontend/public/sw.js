// 🔔 Service worker: shows a notification when the server pushes one (a new
// message while the app isn't in front of you) and opens the chat when it's tapped.
// It doesn't cache anything or touch network requests.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function appWindows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    // Nothing readable was sent: fall through to a plain notification
  }

  const chat = data.conversationId || '';
  const isCall = data.type === 'call';

  event.waitUntil(
    (async () => {
      // 📞 Anything new from a chat ends its "incoming call" notification: the
      // call was answered or declined somewhere, or it's now a missed call
      const ringing = await self.registration.getNotifications({ tag: `call:${chat}` });
      ringing.forEach((notification) => notification.close());
      if (data.type === 'call-over') return;

      // Looking at the app right now: it shows its own toast or call screen
      const windows = await appWindows();
      if (windows.some((client) => client.focused)) return;

      return self.registration.showNotification(data.title || 'Ghost-ed', {
        body: data.body || 'New message',
        icon: '/logo.png',
        badge: '/logo-128.webp',
        // One notification per chat: a newer message replaces the older one
        tag: isCall ? `call:${chat}` : chat || 'ghost-ed',
        renotify: true,
        // 📞 A call stays on screen and keeps buzzing until it's dealt with
        requireInteraction: isCall,
        vibrate: isCall ? [400, 200, 400, 200, 400, 200, 400] : undefined,
        data: { conversationId: chat },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { conversationId } = event.notification.data || {};
  const url = conversationId ? `/chat/${conversationId}` : '/chat';

  event.waitUntil(
    appWindows().then((windows) => {
      const open = windows.find((client) => new URL(client.url).pathname.startsWith('/chat'));
      if (!open) return self.clients.openWindow(url);
      // The app is already open somewhere: bring it forward and let it switch chats
      open.postMessage({ type: 'open-chat', conversationId });
      return open.focus();
    })
  );
});
