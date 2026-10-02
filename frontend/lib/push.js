// 🔔 Push notifications: this browser signs up to be told about new messages
// even when the app is closed. The service worker in public/sw.js shows them.
// It's per browser: each device you use has to be switched on once.

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Notifications could not be turned on. Please try again.');
}

// The server's public key ('' when push isn't set up there)
async function serverKey() {
  const response = await fetch('/api/push/config', { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  return data.key || '';
}

// The key arrives as URL-safe base64; the browser wants the raw bytes
function keyBytes(key) {
  const base64 = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) || null;
}

// 'unsupported' — this browser can't do it (on an iPhone: add the app to the Home Screen first)
// 'unavailable' — the server isn't set up for it
// 'blocked'     — notifications were refused in the browser's settings
// 'on' | 'off'
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  try {
    if (!(await serverKey())) return 'unavailable';
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' && (await currentSubscription()) ? 'on' : 'off';
  } catch {
    return 'unavailable';
  }
}

// Asks for permission (must be called from a tap) and signs this browser up
export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser can’t show notifications.');
  const key = await serverKey();
  if (!key) throw new Error('Notifications aren’t set up on this server.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
  }

  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    });
  }
  await post('/api/push/subscribe', { subscription: subscription.toJSON() });
}

// Stops this browser getting notifications. Also run when logging out, so the
// next person to use this browser doesn't see who is writing to me.
export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await subscription.unsubscribe();
    await post('/api/push/unsubscribe', { endpoint: subscription.endpoint });
  } catch {
    // The server forgets a dead subscription by itself the next time it tries it
  }
}

// On opening the app: tell the server about this browser again, in case its
// subscription was renewed or it was signed up under an older login
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const subscription = await currentSubscription();
    if (subscription) await post('/api/push/subscribe', { subscription: subscription.toJSON() });
  } catch {
    // Not worth bothering anyone about; it's retried the next time the app opens
  }
}
