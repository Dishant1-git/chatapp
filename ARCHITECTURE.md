# Ghost-ed — how it all works

A deep tour of this codebase: what each piece is, why it's there, and the rules it follows.
The [README](README.md) is the short version — this is the long one, for when you need to change
something and want to know what you're standing on.

Everything here was written against the code as it is. Line references look like
`backend/routes/messages.js:40`; they drift as the code changes, so trust the file and the function
name over the number.

**What's in here**

| | | |
| --- | --- | --- |
| [1. What this is](#1-what-this-is) | [7. Calls](#7-calls) | [13. Security notes](#13-security-notes) |
| [2. How a request travels](#2-how-a-request-travels) | [8. The social half](#8-the-social-half) | [14. Testing](#14-testing) |
| [3. Accounts](#3-accounts) | [9. Scheduled messages](#9-scheduled-messages) | [15. Reference: the data](#15-reference-the-data) |
| [4. End-to-end encryption](#4-end-to-end-encryption) | [10. The frontend](#10-the-frontend) | [16. Reference: the API](#16-reference-the-api) |
| [5. Messages](#5-messages) | [11. Speed](#11-speed) | [17. Where do I change…?](#17-where-do-i-change) |
| [6. Realtime](#6-realtime) | [12. Running it](#12-running-it) | [18. Things to be careful with](#18-things-to-be-careful-with) |

---

## 1. What this is

A real-time chat app: private chats, groups, voice and video calls, and a pile of social features
around "being ghosted". Messages, photos, voice notes, video notes and documents are
**end-to-end encrypted in the browser** — the server stores locked bytes it cannot read.

Two applications in one repository:

```
chatapp/
├── backend/     Express 5 + Socket.IO + MongoDB (Mongoose)   — the API and the realtime layer
├── frontend/    Next.js 16 (App Router) + React 19 + Tailwind 4 — the app people look at
└── package.json runs both at once (concurrently)
```

About 17 600 lines of JavaScript, roughly 4 500 in the backend and 13 000 in the frontend — the
frontend carries the UI, all the cryptography and every little social behaviour.

### The stack, and why

| Piece | Version | Why it's here |
| --- | --- | --- |
| **Express 5** | ^5.2 | The API. Express 5 forwards async errors to the error handler by itself, which is why no route has a try/catch around its body. |
| **Socket.IO** | ^4.8 | Realtime messages, typing, presence, and call signalling. Falls back to long-polling where WebSockets are blocked. |
| **MongoDB + Mongoose** | ^9.10 | Documents suit chat data (a message carries its own wrapped keys, reactions, ticks). Also stores uploaded files in GridFS, so no disk is needed. |
| **Next.js 16 (App Router)** | ^16.3 | The client app, plus a proxy: it forwards `/api`, `/uploads` and `/socket.io` to the backend, so the browser only ever talks to one origin. |
| **React 19** | ^19.3 | UI. |
| **Tailwind CSS 4** | ^4.3 | Styling through design tokens (see §10). |
| **framer-motion** | ^13.4 | Panel slides, reaction bursts, call screen transitions. |
| **lucide-react** | ^1.47 | Icons. |
| **bcryptjs / jsonwebtoken** | — | Password hashing, login cookie. |
| **sharp** | ^0.35 | Resizes the pictures that *aren't* secret (profile and group photos, sticker packs). |
| **Web Crypto API** | browser | All of the end-to-end encryption. No crypto library is shipped. |

No state manager, no data-fetching library, no component library. State lives in two React contexts
(`ChatProvider`, `CallProvider`) and in the components themselves.

---

## 2. How a request travels

```
Browser ──► Next.js (3000) ──/api/*, /uploads/*, /socket.io/──► Express (5000) ──► MongoDB
```

- The browser **only** talks to the frontend's origin. `frontend/next.config.mjs` rewrites
  `/api/:path*`, `/uploads/:path*` and `/socket.io/` to `BACKEND_URL`.
- That matters for the login cookie: it belongs to the frontend's domain, so it is first-party and
  needs no cross-site cookie settings, even when the backend lives on another host.
- `BACKEND_URL` is read when the frontend **builds**. `frontend/.env.production` points at the
  deployed backend, so a production build without an explicit `BACKEND_URL` will aim at it —
  something to remember when building for local testing.
- `frontend/proxy.js` is the Next middleware in front of pages: no login cookie → `/login`;
  a cookie on `/login`, `/register` or `/forgot` → `/chat`. It only looks at whether the cookie
  exists; the backend is the one that verifies it.

---

## 3. Accounts

### Signing up

`POST /api/auth/register` (`backend/routes/auth.js`) — multipart, because it can carry a profile
picture. In order: validate the name, the email, the **username** and the **password**; refuse a
duplicate email (409 `EMAIL_TAKEN`) or a taken username (409 `USERNAME_TAKEN`, with free
suggestions); resize the photo; bcrypt the password (10 rounds); create the user; set the cookie;
email a verification code.

- **Usernames** (`backend/utils/username.js`): 3–20 characters, `[a-z][a-z0-9_]*`, a reserved list
  blocked. `GET /api/auth/username?u=…` answers `{ available, problem, suggestions }` and the
  sign-up form calls it as you type. The form fills a handle in from your name; if that one is
  taken it quietly moves to a free suggestion, and only handles you typed yourself stop you.
- **Passwords** (`backend/utils/password.js` and `frontend/lib/password.js` — same rules, twice, on
  purpose): at least 8 characters, a letter, a number or symbol, not your own name/email/username,
  not on a short list of obvious ones. The browser shows the checklist and a strength bar; the
  server refuses regardless of what the browser did.

### The login cookie

`backend/utils/jwt.js`: a JWT with `{ userId }`, signed with `JWT_SECRET`, valid 7 days, set as an
**http-only** cookie named `token` (`sameSite` from `COOKIE_SAME_SITE`, default `lax`; `secure` in
production). `requireAuth` reads that cookie and sets `req.userId`. Nothing trusts a user id sent
in a request body, anywhere.

### Email verification

An account exists but is closed until the six-digit code is typed in.

- The code is `crypto.randomInt(0, 1_000_000)`, stored **only as a SHA-256 hash** in the
  `emailcodes` collection with `expiresAt` 15 minutes out. A TTL index deletes it; the route also
  checks the expiry, because MongoDB's reaper only runs about once a minute.
- Five wrong guesses throw the code away. A new code replaces the old one, at most 6 an hour.
- Enforced on the server, not just in the browser: `requireVerified` (`backend/middleware/auth.js`)
  sits in front of every `/api` route except auth and the account's own encryption keys, and the
  Socket.IO handshake refuses an unverified account too. Key setup is deliberately allowed, so
  encryption can be prepared during sign-up.
- Once an account is verified the answer is remembered in memory (`rememberVerified`), because an
  account never becomes unverified — that saves a database round trip on **every** request.
- `AUTO_VERIFY_EMAIL=1` skips the whole thing. Development and tests only.

**Sending the mail** (`backend/utils/mailer.js`): plain HTTPS to Brevo's API. Free hosting (Render's
free tier among them) blocks outbound SMTP ports 25/465/587 entirely, so Gmail SMTP cannot work
there; the Brevo API is ordinary HTTPS and does. `MAIL_FROM` must be an address verified in Brevo —
your own Gmail is fine, no domain needed. With no `BREVO_API_KEY`, the code is printed to the
server log instead, which is what local development and the tests use.

### Forgotten and changed passwords

- `POST /api/auth/password/forgot` always answers the same way, whether or not the address has an
  account, so it can't be used to find out who is registered.
- `POST /api/auth/password/reset` takes `{ email, code, password }`, sets the new password, marks
  the address verified (reading the code proves it) and logs them in.
- **What that does to old messages:** the private key is locked with the password. A reset can't
  unlock it, so `prepareKeys` notices and creates a **fresh key pair** — messages from before stay
  unreadable, and the reset screen says so plainly before you go ahead.
- `POST /api/auth/password/change` (Profile → Change password) is the way to keep everything: it
  takes the current password, so the browser can unlock the key with the old password and lock it
  again with the new one (`relockKeys`, `frontend/lib/e2ee.js`). Same key pair, nothing lost.

---

## 4. End-to-end encryption

All of it is in `frontend/lib/e2ee.js`, using the Web Crypto API. The server never has a key.

### Keys

- Every user has an **ECDH P-256** key pair, made in the browser at sign-up.
- The **public key** (and a short `keyId`, the first 16 hex of its SHA-256) is stored on the user
  document so others can encrypt for them.
- The **private key** is locked with the login password — PBKDF2-SHA256, **600 000 iterations**, to
  an AES-GCM key — and only that locked copy is uploaded (`keyBackup`, `select: false`). A copy of
  the database alone cannot open it.
- After login the unlocked key is kept in IndexedDB as a **non-extractable** `CryptoKey`, so a
  reload doesn't need the password and no script on the page can export it. Logging out deletes it.
  (That non-extractability is also why a forgotten-password reset can't carry the key over.)

### A message

1. A fresh random **AES-GCM 256** content key per message.
2. The payload — `{ text, image?, media?, file?, sticker? }` — is encrypted with it. The
   **additional authenticated data** is `` `${conversationId}:${senderId}` ``, so a ciphertext
   can't be replayed into another chat or attributed to someone else.
3. That content key is then wrapped **once per member**: ECDH(my private, their public) → HKDF-SHA256
   (info `ghosted-wrap-v1`) → AES-KW. Each wrapped copy is stored as `{ userId, keyId, key }`.
4. Attachments are encrypted with the **same content key** and uploaded as opaque bytes. The wire
   format is a 12-byte IV followed by the AES-GCM ciphertext, with a context string as AAD:
   `image` for photos, `media` for voice and video notes, `file` for documents — so one kind of
   file can't be passed off as another.

Derived wrapping keys are cached per peer for the session, so the expensive part happens once per
person, not once per message.

### What the server can and cannot see

| Sees | Doesn't see |
| --- | --- |
| Who talks to whom, and when | Any message text |
| Message sizes, types (`text`/`image`/`audio`/`video`/`file`/`event`) | Photos, voice notes, video notes, documents |
| Ticks, reactions (emoji), read state | Document names, sizes and types (inside the ciphertext) |
| Profile and group photos, chat backgrounds, sticker-pack pictures | Which built-in sticker was sent |
| Emoji-only messages from someone being ghosted (plain, so the rule can be enforced) | — |
| Who has opened a 🎁 gift (`unwrappedBy`), and when someone is holding one | Whether a message is a gift at all until it's opened, its mood and reveal style |

`backend/utils/encrypted.js` (`checkEncrypted`) refuses a message that isn't locked for **every**
current member, or that used a stale `keyId` — the browser then refreshes the member list and tries
once more (`KEYS_CHANGED`).

Consequences worth knowing: **new group members can't read older messages** (those keys were never
wrapped for them), and **resetting your keys makes your own old messages unreadable**.

---

## 5. Messages

### The model (`backend/models/Message.js`)

`conversationId`, `senderId`, `recipients[]` (everyone else at send time), `messageType`
(`text | image | audio | video | file | event`), the encrypted envelope (`ciphertext`, `iv`,
`senderKey`, `keys[]`), `image` / `media` (URLs of encrypted files), `replyTo`, `reactions[]`,
`deliveredTo[]` / `readBy[]` with the derived `isDelivered` / `isRead`, `isDeleted`, `deletedFor[]`,
`editedAt`, `disappearAfter` / `expiresAt` / `disappeared` (⏳ §5), plus `event`, `forgiveness`, `badge`, `ghostClick` and `unwrappedBy` (🎁 gifts) for the special kinds.

Indexes: `{conversationId, _id}`, `{recipients, isRead}`, `{recipients, isDelivered}`,
`{conversationId, createdAt}`, and `{expiresAt}` (partial: only messages still waiting to disappear).

### Sending

`POST /api/messages` → validate → `checkEncrypted` → `publishMessage`
(`backend/utils/publish.js`), which:

1. saves the message,
2. **emits `message:new` immediately** — to the conversation room and to every participant's own
   room (Socket.IO sends one copy per socket),
3. *then* does the bookkeeping: update the conversation's last message (only if this one really is
   newer), un-hide the chat for anyone who had deleted it.

Emitting before the bookkeeping is deliberate: it used to happen three database writes later, and
two messages saved a moment apart could be announced in the wrong order.

### Order

Chat order is **the order the server saved messages in** (`_id`), and three things keep every screen
agreeing on it:

- The browser sends **one message at a time** (`sendQueue` in `ChatWindow.jsx`). A photo has to be
  encrypted and uploaded; without the queue the line typed after it could be saved first.
- The server announces a message as soon as it exists (above).
- Arrivals are **inserted in place**, not appended (`addOrReplace` + `isBefore`): a message that
  turns up late lands where it belongs. Pending messages of your own sort last until they're saved.

The chat-list preview follows the same rule — an older message can't replace a newer one.

### Reading, editing, deleting

- A page is 30 messages, newest first, then reversed, with `?before=<id>` for the previous page.
- `POST /api/conversations/:id/read` marks everything read; the client collects rapid arrivals into
  one call rather than one per message. It does nothing while the chat is still a 📬 request waiting
  for your answer — reading a stranger's message doesn't give them a read tick (§8).
- Editing is text-only, by the sender, for two minutes after sending (`EDIT_WINDOW_MS`; the server
  allows one more minute so an edit started in time still saves) (`PATCH /api/messages/:id`); the new ciphertext gets a new IV,
  which is also how the decryption cache knows to redo it.
- "Delete for me" adds you to `deletedFor`; "delete for everyone" wipes the content, sets
  `isDeleted` and deletes the files.

### 🔔 Push notifications

For when the app isn't in front of someone (tab in the background, browser closed, phone locked).
A browser signs up from Profile → Notifications: `frontend/lib/push.js` registers `public/sw.js`,
subscribes with the server's VAPID public key (`GET /api/push/config`) and posts the subscription to
`POST /api/push/subscribe` (stored in `pushsubscriptions`, at most 10 per account). `publishMessage`
calls `pushNewMessage` (`backend/utils/push.js`) without waiting for it: every recipient's browsers
get one, except people who muted the chat and someone soft-ghosting the sender. Because messages are
end-to-end encrypted the payload only says **who** wrote ("New message"), never what. The service
worker skips the notification while an app window is focused (the in-app toast covers that), and a
tap opens the chat. 📞 `call:start` also pushes "Incoming call" (`pushIncomingCall`, only deliverable
while it rings) to everyone it rings; that notification stays up and vibrates. It is taken down by a
`call-over` push when the person answers or declines on another device or the call goes ahead without
them, and replaced by the "Missed call" one otherwise. Opening the app while it still rings brings
up the ringing screen (`ringingCallFor`, sent on connect). Logging out unsubscribes the browser; a subscription the push service reports
gone (404/410) is deleted. With `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` unset the switch is hidden.

### ⏳ Disappearing messages

A chat's `disappearAfter` (seconds after being seen: 0 = off, 10 = "instantly", or 1, 2, 4, 8 or 24 hours —
`DISAPPEAR_OPTIONS` in `backend/utils/disappearing.js`, mirrored in `frontend/lib/disappearing.js`) is set with
`PUT /api/conversations/:id/disappearing`. Either person can change it in a one-to-one chat (not while
the other is ghosting you or has stepped away, and not before a request is accepted); in a group,
admins only. Every change posts a `disappearing` note so nobody is caught out.

- **The clock starts when a message has been seen.** `publishMessage` copies the chat's setting onto
  the message as its own `disappearAfter`, so changing the setting never touches messages already
  sent. `expiresAt` stays empty until **every** recipient has read it (in a group, the last reader
  starts it); the second stage of `REFRESH_TICKS` sets it to *now + disappearAfter* the moment
  `isRead` turns true, and clears it again if `isRead` turns false (👀 undo seen). Since every
  change to read state goes through `REFRESH_TICKS` — reading, undo seen, delivery — that's the only
  place the clock lives. A message nobody reads never disappears. With no recipients at all it starts
  at once. `POST /:id/read` then emits `messages:expiring` with the new `expiresAt`s so open chats
  know when to drop them. Notes (`event`) and forgiveness requests never disappear.
- **A sweep every 5 seconds** (`sweepExpired`, started in `server.js`) finds what's due, wipes it
  like *delete for everyone* — text, ciphertext, keys, files, reactions, the reply link — sets
  `disappeared` and clears `expiresAt`, then emits `messages:disappeared` once per chat.
- **The row stays**, holding only sender, recipients and time, because 🔥 streaks and 🧠 read the vibe
  count rows. That's metadata the server sees anyway (§4), and it's what the Terms page promises.
- **Nothing lists it.** `stillVisible()` keeps it out of the message pages (including messages whose
  time is up but the sweep hasn't reached yet), it can't be replied to or reacted to, the chat list
  stops previewing it, and it's marked read so it doesn't count as unread. The browser doesn't wait
  for the sweep either: `ChatWindow` sets a timer for the next `expiresAt` and drops it on time.
  A quote of a message that disappeared reads "⏳ This message disappeared".

### Attachments

| Kind | How it travels |
| --- | --- |
| **Photo** | Resized and stripped of metadata in the browser (`prepareImage`), encrypted, uploaded to `/api/upload/encrypted`, referenced by `image`. Animated GIF/WEBP pass through untouched so they keep moving. |
| **Voice note** | Recorded with MediaRecorder, up to 5 minutes; duration and waveform ride inside the ciphertext. |
| **Video note** | The in-app camera, up to 60 seconds, compressed in the browser (canvas + MediaRecorder, 640 px, ~700 kbps). |
| **Document** | Any file up to 30 MB. Name, type and size are inside the ciphertext, so the server can't tell a spreadsheet from a holiday photo. The receiver's browser only downloads and unlocks it when they tap Save. |
| **Sticker** | Built-in ones travel as an id inside the ciphertext. Pack stickers send an encrypted copy of the picture. |
| **GIF** | Fetched through the backend, then sent as an ordinary (animated) photo. |

**👻 Ghost Click** is the in-app camera: tap for a photo, hold to record. "View once" photos can be
opened one time by each recipient (`POST /api/messages/:id/opened`); the file is deleted once
everyone has, and the sender can't reopen it either.

### Files on the server (`backend/utils/storage.js`)

Everything lands in **MongoDB GridFS** (bucket `uploads`) rather than on disk, because free hosts
wipe the disk on restart. Encrypted blobs are `/uploads/<32 hex>.bin`; the pictures that aren't
secret are converted to WEBP and served as `.webp`. Limits: 5 MB per plain image, 32 MB per
encrypted upload, 30 MB per document. `/uploads/:name` is unauthenticated — the name is random and
the bytes are locked — and cached immutably.

---

## 6. Realtime

`backend/socket/index.js` authenticates every connection with the same cookie as the API (and
refuses unverified accounts). Each socket joins `user:<id>` and one `conversation:<id>` room per
chat it belongs to, so events only reach the people in that chat.

A socket joins the rooms for the chats that existed **when it connected** — there's no re-join when
a new chat appears, which is exactly why `publishMessage` also emits to each participant's own
`user:` room.

Presence counts open tabs: the first connection marks you online, the last one to close writes
`lastSeen`, and closing one of two tabs changes nothing anyone can see. The counter is incremented
before any database call, so a fast disconnect can't be processed before the connect was counted.
On connect, messages that arrived while you were away are marked delivered in one update and the
other side is told.

The browser side is `frontend/hooks/useSocket.js` (connect/disconnect) and the handlers in
`ChatProvider` and `ChatWindow`. Incoming messages are decrypted **one at a time** through a queue,
so decryption speed can't reshuffle them.

### The events

**Browser → server** (only four; everything else is an HTTP call): `typing`, `stopTyping`,
`almostSaid`, `gift:hold`, plus the `call:*` signalling. Each is only relayed to a room the socket has actually
joined, so nobody can type into someone else's chat.

**Server → browser:**

| Event | Means |
| --- | --- |
| `message:new` | A message was saved — `{ message, clientId }` |
| `message:updated` | Part of a message changed (a forgiveness answer, a revive reply, a badge) |
| `message:deleted` | Deleted for everyone |
| `messages:expiring` | ⏳ `{ conversationId, messages: [{ _id, expiresAt }] }` — seen by everyone, the countdown started |
| `messages:disappeared` | ⏳ `{ conversationId, messageIds }` — their time was up and they were wiped |
| `message:reaction` | Reactions changed |
| `messages:delivered` / `messages:read` | Ticks moved |
| `messages:unread` | "Undo seen" put the ticks back |
| `presence` | Someone came online or went offline (`lastSeen`) |
| `typing` / `stopTyping` / `almostSaid` | Relayed from the other person |
| `gift:hold` | 💞 Someone is holding (or let go of) a gift to open it together — `{ messageId, userId, holding }` |
| `conversation:updated` / `:mute` / `:cleared` / `:removed` / `:ghost` / `:pause` | The chat itself changed |
| `user:updated` | A profile changed (name, photo, mood) |
| `keys:changed` | Someone reset their encryption keys — re-fetch them before sending |
| `scheduled:updated` | A scheduled message went out |
| `call:incoming` / `:active` / `:state` / `:signal` / `:ended` | Call signalling |

---

## 7. Calls

WebRTC, with the backend only as a signalling relay and call bookkeeper. See `backend/socket/calls.js`
and `frontend/components/CallProvider.jsx`.

**How one call goes:**

| Step | Event | What happens |
| --- | --- | --- |
| 1 | `call:start` `{ conversationId, video }` | Refused if the chat is ghosted, paused or everyone is already on another call. If a call is already running in that chat, the answer is `{ existing }` and the caller joins it instead. |
| 2 | `call:incoming` → everyone else | Their phone rings — unless they're already in a call. `call:state` tells every chat member a call is live, so the chat shows "Join". |
| 3 | `call:join` / `call:decline` | Joining is capped at 6 people. Other tabs of the same person get `call:answered-elsewhere` and stop ringing. Joiners are announced with `call:participant-joined`. |
| 4 | `call:signal` `{ callId, to, data }` | The offers, answers and ICE candidates, relayed verbatim between two participants. The server never looks inside. |
| 5 | `call:media` `{ audio, video }` | Mute and camera toggles, passed on so the other side can show it. |
| 6 | `call:leave`, disconnect, or nobody left | `call:participant-left`, then `call:ended { reason }` to everyone who was invited. |

**The mesh rule:** whoever joins offers to everyone already in the call; people already there only
answer. That one invariant is what stops two peers offering each other at the same time. New
arrivals are also re-told who has their microphone or camera off, since they'd otherwise assume
everything is on.

- Live call state is **in memory on the server** (`calls`, `userCalls`). A restart ends calls in
  progress — no note is written and no `call:ended` goes out; the browser notices the socket drop
  and says "Call ended: connection lost". Running more than one backend instance would break calls
  outright (the maps and socket ids are per process).
- Ringing stops after **45 seconds**. The note saved in the chat carries `reason`: `declined`,
  `no-answer`, or `ended` — and *cancelling before anyone answers also records `ended`* with a
  duration of 0, which reads as "No answer" for the caller and "Missed call" for the other side.
  (`removed` exists too, but only as a live signal to the person being removed — it is never
  written to a chat.)
- Someone who is being ghosted at any level other than *soft*, or who has stepped away, is dropped
  from a call in that chat and can't start one.
- Signals are relayed verbatim but not unlimited: anything over 20 KB is refused, and every request
  gives up after 10 seconds without an answer.
- When it ends, a note goes into the chat: `Voice call · 3:12`, `Declined voice call`,
  `Missed video call`.
- `GET /api/calls/history` gathers those notes from every chat into the Calls screen, which has its
  own Friends/Groups tabs and a one-tap call back.
- ICE servers come from `GET /api/calls/config`: STUN by default; set `TURN_URL`,
  `TURN_USERNAME` and `TURN_CREDENTIAL` in production, or calls fail on strict networks. The
  browser fetches them once and falls back to a public STUN server if that fails.
- Cameras and microphones need a secure context — calls don't work over plain `http://` on another
  device's IP address.

---

## 8. The social half

This is what makes the app itself rather than a chat demo. Routes live in `backend/routes/social.js`
and `backend/routes/chatActions.js`; labels and rules the browser needs are mirrored in
`frontend/lib/ghost.js` and `frontend/lib/social.js`.

- **👻 Ghost levels** (one-to-one): *soft* (they can write, you get no notifications), *ghosted*
  (emojis only, plus one forgiveness request), *deep* (emojis and reactions only), *permanent*
  (locked). Emoji-only messages are sent **unencrypted**, because the server has to check that they
  really are only emojis — it's the single exception to end-to-end encryption in the app, and it's
  capped at 200 characters. Their messages show as "👻 Ghosted" until you peek, and peeking is
  local: nothing is sent, so they never learn you looked. Two things to know: *soft*'s "no
  notifications" promise is kept **by the browser**, not the server, and reactions are blocked only
  at *permanent*.
- **👻 Boo** (`backend/utils/boo.js`, `routes/boo.js`, `frontend/lib/boo.js`, `BooChat`, `BooBuddy`).
  The app's own ghost, powered by Grok. Boo is **not a user and has no conversation**: `ChatList`
  pins a row to the top of Friends that can't be muted, swiped or deleted, and it opens `/chat/boo`
  (a fixed route that wins over `/chat/[id]`). `POST /api/boo/chat` sends the last 12 turns to Grok
  behind a system prompt that holds Boo's character, a summary of the features (keep it in step with
  this section) and the rule that Boo talks about the app and nothing else. That chat's history
  lives in the browser's `localStorage`, and it is the one chat that **isn't end-to-end encrypted** —
  the screen says so. In a chat where you've been ghosted, `BooBuddy` floats above the ghost banner:
  `POST /api/boo/ghosted { level, canSend }` returns a joke and, while something can still be sent
  (an ordinary message when soft-ghosted, the forgiveness request when ghosted), three messages to
  pick from. Only the level goes to Grok — no names, no messages. A suggestion that's sent carries
  `boo: true` **inside the encrypted payload**, both sides see "👻 Suggested by Boo" under it, Boo
  warns about that before sending, and such a message can't be edited (an edit would drop the
  label, like a gift's wrapping). While Boo is on, `BooRoamer` (mounted in `app/chat/layout.js`)
  drifts a small ghost around the app and plays a prank every half minute or so — a buzz that
  shakes only this screen, a message it "types" above the composer and deletes, peekaboo, a
  flicker. All of it is drawn locally: **nothing touches the real message box, nothing is sent,
  and the other person sees none of it.** It's hidden during calls and with reduce motion.
  Flipping the switch plays `BooShow` (a roaming entrance, or a crying exit). Boo being out is a
  per-device switch (Profile → Boo, or the header of Boo's chat); Boo's row stays regardless. With no `GROK_API_KEY`, or when Grok doesn't answer,
  Boo uses the lines written in `utils/boo.js`.
- **🕊️ Forgiveness request**: one at a time, 24 hours between requests (claimed atomically, so two
  taps can't slip through), text only, encrypted like any message — only its *status* is plain.
  "Ask me later" isn't an API call at all; it's local to the bubble. Forgiving — or simply
  unghosting — gives the **ghoster's own** last message from the 7 days before the ghosting a
  "character development" badge.
- **🔥 Connection streak**: consecutive days where both wrote and there were 5+ messages, or a call,
  or a "miss you". Worked out for every chat in one query, in the browser's time zone, over a
  400-day window.
- **🧠 Read the vibe**: counts only — how many messages each person sent, photos, reactions, 😂
  reactions, calls and minutes, "miss you"s, late-night messages (before 4 am), average reply time,
  and the streak. It never looks at what any message says; it can't, the text is encrypted.
- **🫥 Almost said**: typing for 8+ seconds then deleting it all tells the other person that
  something was typed and abandoned. The text itself is never sent.
- **💕 Miss you** (1 minute cooldown) and **📳 Buzz** (15 seconds) — the buzz vibrates their phone
  and shakes their chat.
- **👀 Undo seen** (offered for 10 seconds after opening a chat that had unread messages, and it
  stops re-marking as read until you write again) and **🫣 anonymous reactions** — others see that
  someone reacted, not what, until you spend one of three daily reveals. The hiding is done by
  masking the emoji in the API response, not by encryption. Both allowances roll over at **UTC**
  midnight, unlike streaks, which use your own time zone.
- **🪦 Dead chats** after 30 quiet days, **🚪 pause** ("exit without drama"), **🧩 inside jokes**
  (5 per chat), **🎭 moods**, **⭐ Trusted Ghosts**, **💖 nicknames**, mute, clear chat, delete chat.
- **🌟 Stickers** come in two kinds. Built-in packs are drawn as SVGs in the app, and a sticker
  travels as **just its id inside the ciphertext**, so the server never learns which one you sent.
  Packs people make are ordinary uploaded pictures (up to 30 per pack, 20 packs each, public or
  "just for me"); sending one encrypts a *copy* of the picture like any photo.
- **🎁 Gift messages** (`lib/gifts.js`, `GiftPicker`, `GiftReveal`). A text message with
  `gift: { mood, style, together }` **inside the encrypted payload**, so the server can't tell a gift
  from any other message. For the receiver it stays wrapped — in the bubble, the chat list, toasts
  (`messagePreview`) and read-aloud — until they play its reveal; then `POST /messages/:id/unwrap`
  adds them to `unwrappedBy`, which un-wraps it on their other devices and shows the sender "opened".
  Gifts can't be edited: an edit re-encrypts `{ text }` alone and would drop the wrapping.
  **💞 Open together** (one-to-one only) is decided entirely in the two browsers: each sends
  `gift:hold` while its button is held (repeated every 1.5 s; the other side forgets a hold after
  3.5 s, so a dropped connection can't leave one stuck), and each opens it once it has seen *both*
  holds for 1.2 s. If the receiver's "unwrapped" reaches the sender first, the sender's screen opens
  too. The reveal code (all ten styles) is loaded only when a gift is opened.
- **🎞️ GIFs** are proxied: the GIPHY key never leaves the server, and the file is downloaded
  server-side (https, a giphy.com host, 5 MB cap — all checked) so the browser can encrypt and send
  it as a normal photo. No key means no GIF tab at all.
- **🖼️ Chat backgrounds** are shared with everyone in the chat and are **not** encrypted — the
  server stores and serves the picture, like a group photo. Any participant can set one (no admin
  needed), and the dark fade over it is capped at 0.6.
- **📬 Message requests.** The first message from someone you've never talked to doesn't land in
  your chats: it waits on a third tab next to Friends and Groups. `conversations.requestFor` holds
  whoever still has to decide, and it's set when the chat is created (`POST /api/conversations`);
  `formatConversation` turns it into `isRequest` for that person and `awaitingAccept` for the one who
  wrote. Until it's answered, **neither side sees the other's presence, last seen or mood**, there's
  no message box (so no reply, no nickname, no call), and nothing is marked read — the sender gets
  ticks for *delivered* and no more. **Accept** (`POST /:id/accept`) clears `requestFor` and tells
  both sides; replying does the same, for any client that gets a message in another way.
  **👻 Ghost forever** (`POST /:id/decline`) adds you to `blockedBy` *and* `hiddenFor`: they can never
  write or call again, the chat leaves your list, and they're never told — to them it simply looks
  like nobody answered. Chats that existed before this feature are marked accepted by the migration.
- A **search never hands out presence**: `GET /api/users/search` returns a name, a handle and a
  picture, nothing about who is online or when they were last here. You learn that by chatting.
- Blocking was removed as a menu item; *unblock* remains (for chats blocked before that), and
  "ghost forever" is the one thing that still blocks.

---

## 9. Scheduled messages

Write once, pick people and a time, and it goes out then (`backend/utils/scheduler.js`). One-to-one
chats only. Up to 20 recipients per message, 50 pending per person, a year ahead at most.

- A timer claims due work every 15 seconds with a single atomic `findOneAndUpdate` (oldest first),
  so the same message can never be claimed twice — the one part of the system that would survive
  running several backends. The document is saved again **after each copy is sent**, so a crash
  mid-batch never sends one twice; anything stuck in `sending` is reset to `pending` at boot.
- Each recipient's copy is encrypted **when it's scheduled**, once per chat, wrapped for every
  member including you (which is how the list can still show you what you wrote).
- Everything is re-checked at send time: the chat still exists, nobody blocked or stepped away
  (writing again counts as coming back), they aren't ghosting you, and the keys still match. If
  their keys changed in the meantime the copy fails with "their encryption keys changed since you
  scheduled it" rather than going out unreadable.

---

## 10. The frontend

### Routes (App Router)

| Path | What it is |
| --- | --- |
| `/login`, `/register`, `/forgot`, `/verify` | Auth screens, all built on `AuthCard` |
| `/chat` | The shell: chat list, and "pick a conversation" |
| `/chat/[id]` | A conversation |
| `/terms` | Terms of Service and copyright notice. Public: not in the proxy matcher, so it opens logged in or out |

`app/chat/layout.js` stays mounted while you move between chats, so the socket and the conversation
list survive navigation.

### State

- **`ChatProvider`** — the logged-in user, conversations, typing, toasts, the sidebar panel, the
  encryption lock, and every socket handler that isn't specific to one chat.
- **`CallProvider`** — active calls, the call screen, the minimised bar.
- Everything else is local component state. There is no store.

### The pieces worth knowing

| Component | Responsibility |
| --- | --- |
| `ChatList` | The list, the Friends/Groups/📬 Requests tabs, search, swipe-to-delete, right-click menu, and the slide-over panels |
| `ChatWindow` | One conversation: loading, sending, the socket handlers for it, ordering, dialogs |
| `Message` | One bubble — text, photo, voice, video, document, sticker, event — plus its menu, reactions and swipe-to-reply. Memoised. |
| `MessageInput` | The composer, emoji/sticker/GIF panels, the attach button, voice recording, typing and "almost said" |
| `Skeleton` | The shimmering placeholders shown while things load |
| `Handwriting` / `Splash` | The name written out a word at a time while the app loads |

### Design tokens

Every colour is a CSS variable in `app/globals.css` (`--brand`, `--panel`, `--header`,
`--bubble-in/out`, `--fg`, `--muted`, …), with a dark set under `.dark`. Tailwind maps them to
`bg-panel`, `text-muted` and so on, so the whole palette — light and dark — changes in that one
file. The current one is warm: cream and terracotta, near-black brown in the dark.

### Accessibility and comfort

Text size and colour, high contrast, and "read new messages aloud" (`lib/accessibility.js`), all
applied before the first paint. Every animation respects *reduce motion*.

### 🫣 Privacy screen

Profile → Privacy screen. Adds `privacy` to `<html>`, which blurs everything marked `private` —
message text, photos, documents, chat-list previews, notification toasts. Hovering one (or tapping
it) shows that one and nothing else. It's a per-device setting, applied before the page paints, so
nothing is briefly readable on the way in (`lib/privacy.js`).

---

## 11. Speed

The things that were slow, and what was done about them — worth knowing before adding something
that undoes one of them.

**Per message (4.6 database operations, measured):**

- The verification check is remembered in memory instead of a lookup per request.
- The message is announced as soon as it's saved.
- The conversation, the quoted message and the members' keys are fetched together, not one after
  the other (`loadKeyHolders`), and `POST /api/messages` answers without waiting for the chat-list
  bookkeeping — two round trips before the sender gets a tick instead of four or five.
- The "un-hide this chat" write only happens when the chat was actually hidden.
- Read receipts from a busy chat are collected into one call rather than one per message.

**Opening the app (1589 ms → 396 ms locally):**

- The splash shows *while* loading instead of for a fixed 1.24 s.
- Opening a chat no longer fetches the whole "read the vibe" report (up to 5 000 messages) just to
  refresh the 🔥 badge the list already had.
- Unread counts, delivery marking and streaks pre-filter on `isRead` / `isDelivered` so the indexes
  do the narrowing instead of the database reading your whole history.
- The logo is a 3 KB WebP rather than a 192 KB PNG; date formatters are built once, not per bubble.
- The camera (and its video compression), sticker store, GIF picker, scheduler, tour, group info,
  profile and calls screens are loaded when they're opened, not in the first download.

On a free Render instance every database round trip costs roughly 200 ms, so removing round trips
matters far more there than locally. Note also that free instances **sleep** after 15 minutes idle —
the first request then waits for a cold start.

---

## 12. Running it

```bash
npm run install:all
cp backend/.env.example backend/.env    # set MONGODB_URI and JWT_SECRET
npm run dev                             # backend :5000, frontend :3000
```

Environment variables are documented in `backend/.env.example` and the README. The ones that decide
behaviour rather than plumbing:

| Variable | Effect if unset |
| --- | --- |
| `BREVO_API_KEY` + `MAIL_FROM` | Verification codes are printed to the server log instead of emailed |
| `AUTO_VERIFY_EMAIL=1` | (Development) new accounts skip verification entirely |
| `TURN_URL` + credentials | Calls fail on strict networks and some mobile carriers |
| `GIPHY_API_KEY` | The GIF tab is hidden |
| `GROK_API_KEY` (+ optional `GROK_MODEL`) | 👻 Boo still shows up, with a few built-in lines instead of real answers |
| `TRUST_PROXY` | Rate limiting sees the proxy's IP, not the visitor's |

### Deploying

Backend on anything that runs a long-lived Node process (Render, Railway, Fly, a VPS); frontend
anywhere that builds Next. Point the health check at `/api/health`. Uploads live in MongoDB, so no
persistent disk is needed.

**Before running more than one backend instance** you would need: the Socket.IO Redis adapter, a
shared rate-limit store, shared call state (it's in memory), and a shared "verified accounts" cache
(also in memory, though it only costs an extra query per instance).

---

## 13. Security notes

- Passwords: bcrypt, 10 rounds. Login is rate-limited per email address, sign-up per IP.
- The login cookie is http-only, so no script can read it; CSRF risk is limited by `sameSite`.
- Every route checks membership of the conversation — being logged in is never enough.
- Uploaded file URLs are unguessable random names, and encrypted files are useless without the key.
- Emails are private: user search matches names and usernames partially, but an email address only
  matches in full, so addresses can't be guessed letter by letter.
- Sender-supplied strings that end up in the page (document names, sticker ids, nicknames) are
  sanitised and length-capped when they're decrypted.
- What is deliberately **not** encrypted: profile/group photos, chat backgrounds, sticker-pack
  pictures, ghost/pause state, moods, nicknames, inside-joke names, and emoji-only messages from
  someone being ghosted (the server has to check those).
- Two things are *hidden* rather than *protected*, and the difference is worth being honest about:
  an **anonymous reaction**'s emoji is stripped from the API response, and **soft ghosting**'s
  "no notifications" is a decision the browser makes. Neither would survive someone reading the raw
  API. Message content is a different matter — that really is encrypted.

---

## 14. Testing

Behaviour is checked by browser tests driving real Chrome (Playwright) against a **local test
database** — never the live one. Each suite registers throwaway accounts, does the thing a person
would do, and asserts what both sides see; several also read MongoDB directly to prove the server
never saw plaintext.

Suites cover: the whole encrypted flow end to end, group chats, calls, the camera and view-once
media, documents and the call log, stickers and packs, GIFs, swipe-to-reply and editing, streaks,
buzz and "miss you", the Friends/Groups tabs and skeletons, sign-up/username/password/reset,
email verification, message ordering, the privacy screen, and the loading animations.

They live outside the repository (in the working scratchpad) and are run with a local backend on
`:5055` and a frontend build pointed at it on `:3055` — with a guard that refuses to run if the app
is pointed anywhere else. Ask if you'd like them moved into the repo as a `tests/` folder.

---

## 15. Reference: the data

Six collections. Everything else hangs off these.

**`users`** — `name`, `email` (unique), `username` (unique), `password` (bcrypt, never returned),
`profileImage`, `emailVerified`, `isOnline` / `lastSeen`, `publicKey` + `keyId`, `keyBackup` (the
locked private key, owner-only), `mood`, `trusted[]` (⭐ Trusted Ghosts, private), `stickerPacks[]`,
`stats` (ghosted/forgave/apologies/revived, private), `daily` (today's reveal and undo-seen
allowances).

**`conversations`** — `type` (`direct` | `group`), `participants[]`, `key` (unique: both user ids
sorted for a direct chat, `group:<random>` otherwise, which is what makes duplicate chats
impossible), `name` / `image` / `admins[]` / `createdBy` for groups, `lastMessage` +
`lastMessageAt`, `mutedBy[]`, `background`, `ghost`, `pausedBy`, `badges[]` (max 5), `blockedBy[]`
(legacy unblock, and 👻 ghost forever), `hiddenFor[]` (deleted chats), `requestFor` (📬 who still has
to accept, `null` once they have), `nicknames` (map), `disappearAfter` (⏳ seconds after being seen, 0 = off).

**`messages`** — see §5. The `event` sub-document covers group changes and everything social:
`created`, `added`, `removed`, `left`, `renamed`, `photo`, `call`, `missYou`, `buzz`, `forgiven`,
`stillGhosted`, `paused`, `returned`, `revive`, `nickname`, `disappearing`.

**`emailcodes`** — one live code per account per purpose (`verify` | `reset`): the hash, `expiresAt`
(TTL index), `attempts`.

**`scheduledmessages`** — `senderId`, `sendAt`, `status`, and one encrypted `item` per recipient.

**`stickerpacks`** — `name`, `createdBy`, `isPublic`, `stickers[]` (max 30), `installs`.

Plus GridFS's own `uploads.files` / `uploads.chunks` for every uploaded file.

---

## 16. Reference: the API

All under `/api`, all cookie-authenticated except where noted. Anything outside `auth` also needs a
confirmed email address.

| Area | Routes |
| --- | --- |
| **auth** | `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`, `POST /auth/verify`, `/auth/verify/resend`, `GET /auth/username?u=`, `POST /auth/password/forgot`, `/password/reset`, `/password/change` |
| **users** | `GET /users/search?q=`, `PATCH /users/me`, `PUT|DELETE /users/me/trusted/:userId` |
| **conversations** | `GET /conversations`, `POST /conversations`, `POST /conversations/groups`, `PATCH /conversations/:id`, `POST|DELETE /:id/members…`, `POST /:id/admins/:userId`, `GET /:id`, `GET /:id/messages?before=`, `POST /:id/read`, `/:id/accept`, `/:id/decline`, `/:id/mute`, `PUT|DELETE /:id/background`, `PUT /:id/disappearing`, `POST /:id/miss-you`, `/:id/buzz` |
| **social** | `POST|DELETE /:id/ghost`, `POST /:id/ghost/answer`, `POST|DELETE /:id/pause`, `POST /:id/revive`, `/:id/revive/:messageId`, `POST|DELETE /:id/badges…`, `POST /:id/unread` (undo seen), `GET /:id/insights` |
| **chat actions** | `DELETE /:id/block` (legacy unblock), `POST /:id/clear`, `DELETE /:id`, `PUT /:id/nickname` |
| **messages** | `POST /messages`, `PATCH /messages/:id`, `DELETE /messages/:id?for=`, `POST /:id/reaction`, `/:id/opened` (view-once), `/:id/reveal` (anonymous reaction), `/:id/unwrap` (🎁 gift opened) |
| **files** | `POST /upload` (plain image), `POST /upload/encrypted` (raw bytes), `GET /uploads/:name` (public, unguessable) |
| **keys** | `GET /keys/backup`, `PUT /keys` |
| **calls** | `GET /calls/config` (ICE servers), `GET /calls/history?before=` |
| **stickers** | `GET /stickers/packs`, `/stickers/installed`, `POST /stickers/packs`, `POST|DELETE /packs/:id/install`, `DELETE /packs/:id` |
| **gifs** | `GET /gifs/config`, `GET /gifs?q=`, `GET /gifs/file` |
| **boo** | `POST /boo/chat`, `POST /boo/ghosted` (20 a minute per person) |
| **scheduled** | `GET /scheduled`, `POST /scheduled`, `DELETE /scheduled/:id` |
| **health** | `GET /health` (no auth, no database required) |

Errors are always `{ error: "A sentence." }`, sometimes with a `code` the browser branches on:
`KEYS_CHANGED`, `NO_KEYS`, `EMAIL_NOT_VERIFIED`, `CODE_EXPIRED`, `USERNAME_TAKEN`, `EMAIL_TAKEN`,
`NO_GIF_KEY`.

**Rate limits** (`backend/middleware/rateLimits.js`): login 10 per 15 min *per email*, sign-up 20/h
per IP, messages 60/min, uploads 30 per 10 min, searches 60/min, username checks 40/min per IP,
verification codes 6/h, key changes 10/h, group changes 60 per 10 min.

---

## 17. Where do I change…?

| I want to… | Start here |
| --- | --- |
| Change a colour, light or dark | `frontend/app/globals.css` — the tokens at the top |
| Add a message type | `backend/models/Message.js` (enum) → `routes/messages.js` (validation) → `lib/e2ee.js` (payload) → `components/Message.jsx` (bubble) → `lib/format.js` (`messagePreview`) |
| Change what the chat list shows | `components/ChatList.jsx` + `lib/format.js` |
| Add a socket event | `backend/utils/publish.js` or the route → a handler in `ChatProvider.jsx` or `ChatWindow.jsx` |
| Change a limit (group size, file size, cooldown) | The constants at the top of the matching model or util — they're all exported and named |
| Add a setting people can toggle | `components/Profile.jsx`, with the value in `localStorage` and a class on `<html>` if it affects the whole app (see `lib/privacy.js`) |
| Change how a chat is ordered or paged | `routes/conversations.js` (`GET /:id/messages`) and `addOrReplace` in `ChatWindow.jsx` |
| Send a new kind of email | `backend/utils/mailer.js` — add a template next to `verificationMail` |
| Add a 🎁 gift mood or reveal style | `frontend/lib/gifts.js` (`MOODS` / `STYLES`), then a stage in `components/GiftReveal.jsx` (`STAGES`) |
| Touch the crypto | `frontend/lib/e2ee.js` only. Everything else treats it as opaque, and `backend/utils/encrypted.js` is the server's half of the contract |

---

## 18. Things to be careful with

- **`frontend/.env.production` points at the live backend.** A production build without
  `BACKEND_URL` set will proxy there — including one you meant to test locally.
- **Changing the message list's ordering code** (`addOrReplace`, the send queue, the emit position
  in `publishMessage`) can bring the out-of-order bug back. The `ordering` suite exists for that.
- **`requireVerified`'s memory cache** assumes an account never becomes unverified again. If that
  ever changes, the cache has to be invalidated.
- **Call state is in memory.** Restarting the backend drops calls in progress.
- **📬 Requests change what a new chat looks like from the other side.** Anything that assumes a
  first message can be replied to straight away — a test, a tour, a demo — has to accept the request
  first. And anything that marks messages read has to keep skipping chats where `requestFor` is the
  reader.
- **Resetting keys is destructive** and silent from the server's point of view — the messages stay,
  they simply can't be opened any more. The UI has to keep saying so.
- **Free Render instances sleep**; the first request after idle is slow, and SMTP ports are blocked
  there for good.
