// 🖼️ Chat backgrounds: a picture behind the messages of ONE chat.
// Each chat has its own, and chats without one keep the normal background.
//
// Backgrounds are kept on this device only (IndexedDB), never uploaded: a
// wallpaper is a personal choice, the other person doesn't see it, and it
// doesn't need to travel through the server.

const DB_NAME = 'ghosted-backgrounds';
const STORE = 'backgrounds';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage is busy in another tab'));
  });
}

async function withStore(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      // e.g. storage quota exceeded — fires without onerror
      tx.onabort = () => reject(tx.error || new Error('There was no room to save it.'));
    });
  } finally {
    db.close();
  }
}

// { blob, dim } for this chat, or null. Private browsing (or blocked storage)
// simply means no background.
export async function loadBackground(conversationId) {
  try {
    const saved = await withStore('readonly', (store) => store.get(String(conversationId)));
    return saved?.blob ? saved : null;
  } catch {
    return null;
  }
}

// dim (0–0.6): how much to fade the picture, so messages stay easy to read
export function saveBackground(conversationId, blob, dim) {
  return withStore('readwrite', (store) => store.put({ blob, dim }, String(conversationId)));
}

export function removeBackground(conversationId) {
  return withStore('readwrite', (store) => store.delete(String(conversationId)));
}

// The CSS for a chat's background: the picture, faded by `dim`
export function backgroundStyle(url, dim = 0.25) {
  if (!url) return undefined;
  const fade = `rgba(0, 0, 0, ${dim})`;
  return {
    backgroundImage: `linear-gradient(${fade}, ${fade}), url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}
