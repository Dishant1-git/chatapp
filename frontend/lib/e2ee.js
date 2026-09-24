// End-to-end encryption, done entirely in the browser with the Web Crypto API.
//
// - Every user has an ECDH P-256 key pair. The public key is stored on the
//   server so others can encrypt for them. The private key is locked with the
//   user's login password (PBKDF2 → AES-GCM) before it's uploaded as a backup,
//   so a copy of the database alone can't open it. It's unlocked automatically
//   when the user logs in (see lib/accountKeys.js) — there's no separate PIN.
// - Once unlocked, the private key is kept in IndexedDB as a non-extractable
//   CryptoKey, so reloading the page doesn't need the password again.
// - Each message gets a fresh random AES-GCM key. The message is encrypted with
//   it, and that key is then locked separately for every member of the chat
//   (ECDH between the sender and that member → HKDF → AES-KW). Images are
//   encrypted with the same message key before they are uploaded.
// - New group members can't read older messages, because those keys were never
//   locked for them. Resetting your keys makes your old messages unreadable.

const SECRET_ITERATIONS = 600000;
const WRAP_INFO = new TextEncoder().encode('ghosted-wrap-v1');
const EC = { name: 'ECDH', namedCurve: 'P-256' };

const DB_NAME = 'ghosted';
const STORE = 'keys';

// The unlocked key of the logged-in user: { userId, privateKey, publicKey, keyId }
let session = null;
// Caches so each thing is only worked out once
const wrappingKeys = new Map(); // other user's public key → AES-KW key
// "message id:iv" → Promise<{ payload, contentKey } | null>. An edited message gets a new iv,
// so it's decrypted again.
const openedMessages = new Map();
const imageUrls = new Map(); // encrypted file URL → Promise<object URL>

// ---- Helpers ----

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

// Same as the server's computeKeyId (backend/routes/keys.js)
async function keyIdFor(publicKey) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(publicKey));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

// Binds a message's content to its chat and sender, so the server can't
// move an encrypted message to another chat or pass it off as someone else's
function messageContext(conversationId, senderId) {
  return encoder.encode(`${conversationId}:${senderId}`);
}

// ---- Device storage (IndexedDB) ----

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
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
      tx.onabort = () => reject(tx.error || new Error('Storage failed'));
    });
  } finally {
    db.close();
  }
}

function saveDeviceKey(entry) {
  return withStore('readwrite', (store) => store.put(entry, entry.userId));
}

function loadDeviceKey(userId) {
  return withStore('readonly', (store) => store.get(userId));
}

// Forgets the unlocked keys on this device (on logout)
export async function clearDeviceKeys() {
  session = null;
  wrappingKeys.clear();
  openedMessages.clear();
  imageUrls.forEach((promise) => promise.then((url) => URL.revokeObjectURL(url)).catch(() => {}));
  imageUrls.clear();
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    // Nothing stored, or storage is blocked
  }
}

// ---- Setting up and unlocking ----

export function isUnlocked() {
  return Boolean(session);
}

export function getSessionKeyId() {
  return session?.keyId || null;
}

async function deriveSecretKey(secret, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function startSession(userId, privateKey, publicKey, keyId) {
  session = { userId, privateKey, publicKey, keyId };
  wrappingKeys.clear();
  openedMessages.clear();
  try {
    await saveDeviceKey(session);
  } catch {
    // Private browsing may block IndexedDB — the user then has to log in again on each visit
  }
}

// Uses the key already unlocked on this device, if it's still the account's current key
export async function restoreSession(user) {
  if (!user.publicKey) return false;
  try {
    const stored = await loadDeviceKey(user._id);
    if (!stored || stored.keyId !== user.keyId) return false;
    session = stored;
    return true;
  } catch {
    return false;
  }
}

// Creates a new key pair and locks the private key with the secret (the login password).
// Returns the request body for PUT /api/keys.
export async function createKeys(userId, secret) {
  const pair = await crypto.subtle.generateKey(EC, true, ['deriveKey', 'deriveBits']);
  const publicKey = toBase64(await crypto.subtle.exportKey('spki', pair.publicKey));
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const secretKey = await deriveSecretKey(secret, salt, SECRET_ITERATIONS);
  const encryptedPrivateKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secretKey, pkcs8);

  // Re-import so the copy we keep can't be exported by any script on the page
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, EC, false, ['deriveKey', 'deriveBits']);

  return {
    body: {
      publicKey,
      backup: {
        encryptedPrivateKey: toBase64(encryptedPrivateKey),
        salt: toBase64(salt),
        iv: toBase64(iv),
        iterations: SECRET_ITERATIONS,
      },
    },
    // Call once the server has accepted the keys
    activate: async () => startSession(userId, privateKey, publicKey, await keyIdFor(publicKey)),
  };
}

// Opens the locked backup from GET /api/keys/backup. Throws if the secret is wrong.
export async function unlockKeys(userId, { publicKey, keyId, backup }, secret) {
  const secretKey = await deriveSecretKey(secret, fromBase64(backup.salt), backup.iterations);
  let pkcs8;
  try {
    pkcs8 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(backup.iv) },
      secretKey,
      fromBase64(backup.encryptedPrivateKey)
    );
  } catch {
    throw new Error('Could not unlock your encryption key.');
  }
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, EC, false, ['deriveKey', 'deriveBits']);
  await startSession(userId, privateKey, publicKey, keyId);
}

// ---- Encrypting and decrypting messages ----

// The AES-KW key shared by me and the owner of this public key.
// Both sides work out the same key: ECDH(mine, theirs) = ECDH(theirs, mine).
async function wrappingKeyFor(publicKey) {
  if (!wrappingKeys.has(publicKey)) {
    const promise = (async () => {
      const theirs = await crypto.subtle.importKey('spki', fromBase64(publicKey), EC, false, []);
      const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, session.privateKey, 256);
      const hkdf = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: WRAP_INFO },
        hkdf,
        { name: 'AES-KW', length: 256 },
        false,
        ['wrapKey', 'unwrapKey']
      );
    })();
    promise.catch(() => wrappingKeys.delete(publicKey));
    wrappingKeys.set(publicKey, promise);
  }
  return wrappingKeys.get(publicKey);
}

// members: everyone in the chat, including me: [{ _id, publicKey, keyId }]
// payload: { text, image?: { type, width, height },
//            media?: { kind: 'audio' | 'video', type, duration, waveform?, mirrored? } }
export async function encryptMessage({ conversationId, members, payload }) {
  if (!session) throw new Error('Encryption is locked. Please reload the page.');

  const missing = members.filter((m) => !m.publicKey);
  if (missing.length) {
    const names = missing.map((m) => m.name).join(', ');
    throw new Error(
      `${names} ${missing.length > 1 ? "haven't" : "hasn't"} set up encryption yet. They'll be able to receive messages after their next login.`
    );
  }

  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: messageContext(conversationId, session.userId) },
    contentKey,
    encoder.encode(JSON.stringify(payload))
  );

  const keys = await Promise.all(
    members.map(async (member) => {
      const publicKey = member._id === session.userId ? session.publicKey : member.publicKey;
      const wrapped = await crypto.subtle.wrapKey('raw', contentKey, await wrappingKeyFor(publicKey), 'AES-KW');
      return {
        userId: member._id,
        keyId: member._id === session.userId ? session.keyId : member.keyId,
        key: toBase64(wrapped),
      };
    })
  );

  return {
    encrypted: { ciphertext: toBase64(ciphertext), iv: toBase64(iv), senderKey: session.publicKey, keys },
    contentKey,
  };
}

async function decryptPayload(message) {
  const myId = session.userId;
  const entry = message.keys?.find((k) => String(k.userId) === myId);
  if (!entry) return null;

  const contentKey = await crypto.subtle.unwrapKey(
    'raw',
    fromBase64(entry.key),
    await wrappingKeyFor(message.senderKey),
    'AES-KW',
    'AES-GCM',
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(message.iv),
      additionalData: messageContext(message.conversationId, String(message.senderId)),
    },
    contentKey,
    fromBase64(message.ciphertext)
  );
  return { payload: JSON.parse(decoder.decode(plain)), contentKey };
}

// Returns a copy of the message with its decrypted text in `text`, plus
// `contentKey` (to open its image) and `image*` details. Messages that can't
// be opened get `undecryptable: true`. Plain (older) messages are returned as-is.
export async function openMessage(message, conversationId = message?.conversationId) {
  if (!message || typeof message !== 'object') return message;

  let opened = message;
  if (message.ciphertext && !session) {
    opened = { ...message, text: '', undecryptable: true };
  } else if (message.ciphertext) {
    const full = { ...message, conversationId: String(message.conversationId || conversationId) };
    const cacheKey = `${message._id}:${message.iv}`;
    if (!openedMessages.has(cacheKey)) {
      openedMessages.set(cacheKey, decryptPayload(full).catch(() => null));
    }
    const result = await openedMessages.get(cacheKey);
    opened = result
      ? {
          ...full,
          text: String(result.payload.text || ''),
          // 🌟 The sticker's id; it's checked against the pack before it's shown
          sticker: typeof result.payload.sticker === 'string' ? result.payload.sticker : '',
          // One of the sender's own stickers: an image shown sticker-style
          stickerImage: result.payload.stickerImage === true,
          imageType: result.payload.image?.type || '',
          imageWidth: result.payload.image?.width || 0,
          imageHeight: result.payload.image?.height || 0,
          ...(result.payload.media && openMediaDetails(result.payload.media)),
          contentKey: result.contentKey,
        }
      : { ...full, text: '', undecryptable: true };
  }

  if (opened.replyTo && typeof opened.replyTo === 'object') {
    opened = { ...opened, replyTo: await openMessage(opened.replyTo, conversationId) };
  }
  return opened;
}

// Details of a voice message or video note, checked since they come from the sender
function openMediaDetails(media) {
  const waveform = Array.isArray(media.waveform) ? media.waveform.slice(0, 64) : [];
  return {
    // What the sender recorded. It's worth knowing even if the file itself is
    // missing, so the message can say what it was meant to be.
    mediaKind: ['audio', 'video'].includes(media.kind) ? media.kind : '',
    mediaType: typeof media.type === 'string' ? media.type : '',
    mediaDuration: Math.max(0, Number(media.duration) || 0),
    mediaWaveform: waveform.map((v) => Math.min(31, Math.max(0, Number(v) || 0))),
    mediaMirrored: media.mirrored === true,
  };
}

export function openMessages(messages, conversationId) {
  return Promise.all(messages.map((m) => openMessage(m, conversationId)));
}

// ---- Images ----

// Shrinks the photo (like the server used to) and removes its metadata,
// since the server can no longer do that for encrypted images
// How big a picture is, without giving up if the browser can't decode it
function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const done = (size) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => done({ width: 0, height: 0 });
    image.src = url;
  });
}

export async function prepareImage(file, maxSize = 1600) {
  // 🎞️ A GIF is sent as it is: drawing it on a canvas would leave one frame.
  // Its size is only used for the bubble's shape, so it isn't worth failing over.
  if (file.type === 'image/gif') {
    return { blob: file, type: file.type, ...(await imageSize(file)) };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
  let blob = await toBlob('image/webp');
  // Safari can't make WEBP and falls back to PNG, which is much larger
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
  if (!blob) throw new Error('This image could not be read.');

  return { blob, width, height, type: blob.type };
}

// Encrypted file = 12-byte IV followed by the AES-GCM ciphertext.
// context is 'image' for photos and 'media' for voice messages and video notes,
// so one kind of file can't be passed off as the other.
export async function encryptFile(contentKey, blob, context = 'image') {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    contentKey,
    await blob.arrayBuffer()
  );
  return new Blob([iv, data], { type: 'application/octet-stream' });
}

// Downloads and decrypts an image; resolves to an object URL for <img src>
export function decryptImage(url, contentKey, type = 'image/webp', context = 'image') {
  if (!imageUrls.has(url)) {
    const promise = (async () => {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('File not found');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(context) },
        contentKey,
        bytes.subarray(12)
      );
      return URL.createObjectURL(new Blob([plain], { type }));
    })();
    promise.catch(() => imageUrls.delete(url));
    imageUrls.set(url, promise);
  }
  return imageUrls.get(url);
}

// Same for a voice message or video note; resolves to an object URL for <audio>/<video>
export function decryptMedia(url, contentKey, type) {
  return decryptImage(url, contentKey, type, 'media');
}

// Lets the sender show their own image straight away, without downloading it again
export function rememberImage(url, objectUrl) {
  imageUrls.set(url, Promise.resolve(objectUrl));
}
