# Ghosted

A real-time chat app with end-to-end encryption, group chats and voice/video calls. The **frontend** is Next.js and the **backend** is
Express + Socket.IO + MongoDB, each in its own folder.
It's inspired by the feel of WhatsApp on mobile: a full-screen chat list, full-screen
conversations, and a clean two-column layout on desktop.

**The look:** warm and quiet — a cream wash behind everything, with the chat list and the
conversation as near-white cards on top of it (full screen on a phone, side by side with rounded
corners on a computer). Titles, buttons and your own bubbles are terracotta; the other person's are
a pale blush. Dark mode is the same idea in near-black brown with salmon accents. Every colour is a
token in `frontend/app/globals.css` (`--brand`, `--panel`, `--header`, `--bubble-in/out`, `--on-brand`,
…), so the whole palette — light and dark — changes in that one file.

**Features:** register/login, profiles with photos, user search, private conversations,
**group chats** (admins, add/remove members, rename, group photo), **end-to-end encrypted**
messages and photos, **voice and video calls** (one-to-one and groups of up to 6),
real-time messages, online status and last seen, typing indicator, sent/delivered/read ticks,
photo sharing, reactions, replies (swipe a message to the right), editing your own messages,
**Friends / Groups tabs** over the chat list, in-app notifications with unread counts, delete for
me/everyone, message pagination, **skeleton placeholders** while things load, and light/dark mode.

```
chatapp/
├── backend/     Express REST API + Socket.IO + MongoDB   (port 5000)
├── frontend/    Next.js app                              (port 3000)
└── package.json Helper scripts to run both at once
```

## Getting started

You need **Node.js 20.12+** (22 recommended) and **MongoDB** (local or MongoDB Atlas).

```bash
# 1. Install everything (root, backend and frontend)
npm run install:all

# 2. Configure the backend
cp backend/.env.example backend/.env      # then set MONGODB_URI and JWT_SECRET

# 3. Start both apps
npm run dev
```

Open http://localhost:3000.

You can also run each app on its own, in two terminals:

```bash
cd backend && npm run dev      # API on http://localhost:5000 (restarts on file changes)
cd frontend && npm run dev     # app on http://localhost:3000
```

Production:

```bash
npm run build     # builds the frontend
npm start         # starts backend + frontend
```

### Environment variables

**backend/.env**

| Variable           | Example                              | What it's for                                          |
| ------------------ | ------------------------------------ | ------------------------------------------------------ |
| `PORT`             | `5000`                               | Port for the API                                       |
| `MONGODB_URI`      | `mongodb://127.0.0.1:27017/chat-app` | MongoDB connection string                              |
| `JWT_SECRET`       | long random string                   | Signs the login cookie. Keep it secret.                |
| `CLIENT_URL`       | `http://localhost:3000`              | Frontend URL(s), comma-separated. Used for CORS.       |
| `UPLOAD_DIR`       | `uploads`                            | Old upload folder, still read for files saved before uploads moved to MongoDB |
| `TRUST_PROXY`      | `1`                                  | Optional. Set to `1` when the frontend runs on another server |
| `COOKIE_SAME_SITE` | `none`                               | Optional. Only if the browser calls the API directly on another domain |
| `STUN_URLS`        | `stun:stun.l.google.com:19302`       | Optional. STUN servers for calls, comma-separated      |
| `TURN_URL`         | `turn:turn.example.com:3478`         | Optional but recommended in production. TURN relay for calls |
| `TURN_USERNAME`    |                                      | TURN username                                          |
| `TURN_CREDENTIAL`  |                                      | TURN password                                          |
| `GIPHY_API_KEY`    |                                      | Optional. Turns on 🎞️ GIF search (free key from developers.giphy.com). Without it the GIF tab is hidden |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**frontend/.env.local** (optional)

| Variable      | Default                 | What it's for                                                      |
| ------------- | ----------------------- | ------------------------------------------------------------------ |
| `BACKEND_URL` | `http://localhost:5000` | Where the backend runs. Read at **build time**, so rebuild after changing it. |

The frontend doesn't need `JWT_SECRET` or database access. Only the backend has them.

## How it works

```
Browser ──► Next.js (frontend) ──/api, /socket.io, /uploads──► Express (backend) ──► MongoDB
```

- **The browser only talks to the frontend.** Next.js forwards `/api/*`, `/uploads/*` and
  `/socket.io/` (including the WebSocket connection) to the backend using `rewrites` in
  `frontend/next.config.mjs`. The login cookie therefore belongs to the frontend's domain,
  and you don't need cross-site cookie settings, even when frontend and backend are hosted separately.
- **Sending a message:** the browser encrypts it, then calls `POST /api/messages`. The backend checks
  that you're in the conversation and that the message was encrypted for every member, saves it, and
  **then** emits `message:new` to the conversation's Socket.IO room. Messages are never broadcast
  before they're saved.
- **Socket.IO** pushes updates (new messages, reactions, deletes, read receipts, presence) and
  relays typing events. It's authenticated with the same http-only cookie as the API.
- **Rooms:** each socket joins `user:<id>` and one `conversation:<id>` room per conversation,
  so events only go to the two people in a chat.
- **Online status** is tracked per user (counting open tabs), saved to MongoDB, and `lastSeen`
  is written when the last tab closes.
- **Ticks:** a message is *delivered* if the receiver has the app open when it's sent (or as soon
  as they connect), and *read* when they open the conversation.
- **Chat photos** are resized and encrypted in the browser, then stored as-is in MongoDB (GridFS,
  the `uploads` bucket) and served at `/uploads/<name>.bin`, so the server never sees them. **Profile
  and group photos** aren't secret: they're checked, resized and converted to WEBP with `sharp` and
  served at `/uploads/<name>.webp`. Files live in the database rather than on disk because hosts like
  Render wipe the disk on every restart. Only `backend/utils/storage.js` knows where files go, so
  switching to S3 or Cloudinary means changing that file only.

### End-to-end encryption

- Encryption is on by default — there's nothing to set up. Each user has an ECDH P-256 key pair,
  created in the browser when they sign up and locked with their **login password** (PBKDF2 with
  600,000 rounds, then AES-GCM). The server stores the public key and the **locked** private key
  (`frontend/lib/accountKeys.js` does this right after login/sign-up).
- Logging in on any device unlocks the key with the password the user just typed. The unlocked key
  is kept in IndexedDB as a non-extractable key (so reloads don't ask for anything) and deleted on
  logout. If a device loses it (e.g. browser data cleared), the user is simply asked to log in again.
- Accounts from the earlier PIN version get new keys at their next login (the old key can't be
  opened without the PIN), so messages sent to them before that can't be decrypted.
- Every message gets a fresh AES-256-GCM key. The message (and its photo) is encrypted with it, and
  that key is locked separately for each member of the chat (ECDH → HKDF → AES-KW). The server
  checks that every current member got a copy, made with the latest version of their key.
- The encrypted content is tied to its chat and sender, so the server can't move a message into
  another chat or pass it off as someone else's.
- **What the server can still see:** who talks to whom and when, group names and photos, reactions
  and read receipts. Messages sent before encryption was added stay readable as they were.
- **Trade-offs:** there's no forward secrecy (a stolen private key can open that user's old messages),
  and there's no safety-number check yet, so users have to trust that the server hands out the real
  public keys. Because the key is locked with the login password — which the server receives when
  you log in — a dishonest server operator could in theory unlock it; a stolen copy of the database
  alone can't. A weak password is easier to guess, so good passwords matter.
- People added to a group can't read messages sent before they joined.

### Calls

- Calls use **WebRTC**. Audio and video go directly between browsers (or through a TURN relay) and are
  always encrypted by WebRTC (DTLS-SRTP). The server only relays connection setup over Socket.IO
  (`backend/socket/calls.js`) and keeps track of who is in which call, in memory.
- Group calls connect everyone to everyone (a "mesh"), which works well for up to 6 people.
  Whoever joins sends an offer to each person already in the call.
- A call rings for 45 seconds. When it ends, a note like "Voice call · 3:12" or "Missed video call"
  is added to the chat.
- Browsers only allow the camera and microphone on **https** pages (or `localhost`). Opening the app
  from another device through a local IP like `http://192.168.x.x:3000` won't work for calls.
- Without a TURN server, calls fail on some networks (often mobile data or company Wi-Fi). Set
  `TURN_URL` in production.

### Social features

Routes live in `backend/routes/social.js`; labels in `frontend/lib/ghost.js` and `frontend/lib/social.js`.

- **👻 Ghost levels** (one-to-one chats): *Soft* (they can message, you get no notifications),
  *Ghosted* (emojis only, plus one forgiveness request), *Deep* (emojis and reactions only, no
  request), *Permanent* (locked). Emoji-only messages are sent unencrypted so the server can check them. Their messages show as "👻 Ghosted"
  until you peek. Ghosted people can't call you (except in soft mode).
- **🕊️ Forgiveness request**: one encrypted request at a time, 24 hours between requests. The
  ghoster answers 🕊️ Forgive / 👻 Keep ghosting / ⏳ Ask me later. Forgiving (or unghosting) gives
  the ghoster's last message before ghosting a "🕊️ Character development" badge.
- **🫥 Almost said**: typing for 8+ seconds and then deleting everything tells the other person
  "They typed something... then disappeared." Only that fact is sent — never the text.
- **🔥 Connection streak**: consecutive days where you both wrote and there were 5+ messages, or a
  call, or a "miss you". Shown next to the name in the chat list once it reaches 2 days, Snapchat
  style (`backend/utils/streak.js` works out every chat's streak in one query, in the browser's
  time zone). **🧠 Read the vibe**: message/reaction/photo/call counts, average reply
  time and a playful label — worked out from counts only, never from message content.
- **🎭 Mood**: six moods shown next to your name. **📊 Your social life**: private counters in your
  profile (ghosted, forgave, apologies, revived) that only you can see.
- **👀 Undo seen** (3 a day) and **🫣 anonymous reactions** with reveal (3 a day).
- **🚪 Leave conversation**: the chat is paused and hidden for you; they see a short note and can't
  message or call. Opening the chat again resumes it.
- **🪦 Dead chats**: after 30 quiet days, either person can ask "Should we revive this?" (❤️ / 😂 / 👻).
- **🧩 Inside jokes**: up to 5 badges shown at the top of a chat.
- **📳 Buzz** (header button, one-to-one chats): vibrates the other person's phone and shakes their
  chat if it's open. One buzz every 15 seconds. Muted and soft-ghosted chats don't vibrate. Browsers only
  allow vibration on Android phones; on iPhones and computers there's just the shake and notification.
- Not end-to-end encrypted (plain data): inside-joke names, moods, ghost/pause state, and the
  answers to requests. Message text — including forgiveness requests — stays encrypted.

### Ghost Click, accessibility and Trusted Ghosts

- **👻 Ghost Click** (the 📷 camera button next to the message box — the only one for photos and
  videos): **tap** the round button for a photo, **hold** it to record a video (up to 60 seconds,
  with sound), or pick a photo **or video** from the device. A picked video can be up to a minute
  and is re-encoded smaller first (`frontend/lib/videoCompress.js`: 640 px wide, ~700 kbps, sound
  kept), with a progress bar while it works — a minute of phone footage ends up around 5 MB. Then choose *👻 View once* or *💾 Can be saved* and
  add a caption. Everything is encrypted like any chat photo. A view-once photo or video opens one
  time per person (`POST /api/messages/:id/opened`); after that the server stops sending its link,
  and once everyone has opened it the file is deleted. Savable photos and videos have a Save button
  (for a video, *Save video* in its menu). No website can stop screenshots or a second camera.
- **🎤 Voice messages** (the mic button, when nothing is typed): recorded with `MediaRecorder`
  (`frontend/lib/recording.js`), encrypted and uploaded like a photo, then played back with a
  waveform and 1×/1.5×/2× speed. The recording, its length and its waveform all travel inside the
  encrypted message; the server only stores the file. If a saved message comes back without its
  recording — an out-of-date server drops it — sending fails with a clear message instead of
  leaving an empty bubble.
- **🎞️ GIFs**: GIFs can be sent like any photo and stay animated — the browser sends them as they
  are (a canvas would keep one frame), and sticker packs made from GIFs are stored as animated
  WEBP. A picture **pasted** into the message box, or dropped on it, is sent as a photo — so a GIF
  copied from anywhere can be sent that way. With `GIPHY_API_KEY` set there's a 🎞️ GIF tab with search
  (`backend/routes/gifs.js` proxies GIPHY so the key never reaches the browser); without a key the
  tab isn't shown.
  **Not possible today:** the phone keyboard's own GIF and sticker buttons ("This app does not
  support images here"). Chrome for Android doesn't pass keyboard media to web pages at all yet —
  the work sits behind an unfinished `Enable IME media insertion` flag in Canary — so no website
  can accept them. A rich-text message box was tried and reverted: it changed nothing for the
  keyboard and a plain `<textarea>` types, autocorrects and swipes better. Use the in-app GIF tab
  and sticker packs, or copy a GIF and paste it in.
- **🌟 Stickers** (the emoji button → *Stickers*): two built-in packs — 👻 Ghosts and 🧸 Bear &
  Panda — drawn as original SVGs in `frontend/public/stickers` and listed in
  `frontend/lib/stickers.js`. A sticker message carries only the sticker's id, inside the encrypted
  message, so the server can't tell a sticker from any other message. They're shown large, without a
  bubble. Emoji-only (ghosted) chats can't send them.
- **⭐ Sticker packs** (*Get stickers* in the sticker panel): make a pack from your own pictures
  (a name plus up to 30 images) and choose who it's for — **🔒 Just for me** (the default: nobody
  else sees it) or **🌍 Everyone**, which puts it in the packs screen for every user, most
  installed first. A pack never shows who made it, only its name, and whoever made it can delete
  it, which removes it for everyone who added it. Sending one of these stickers encrypts a copy of
  the picture like a photo, so the other person doesn't need the pack and the server can't tell it
  from any other photo. **Animated stickers stay animated** all the way through: the upload keeps
  every frame (sharp with `animated: true`, frame count read from the file's metadata) and the send
  skips the canvas that would otherwise freeze them (`isAnimatedImage` in `frontend/lib/e2ee.js`).
  A public pack is there for anyone, with no moderation built in, so only publish pictures you're
  happy to share and have the right to use (`backend/routes/stickers.js`).
- **🖼️ Chat background** (⋮ menu): a picture behind the messages of **one** chat, seen by everyone
  in that chat — in a group, every member, and any member can change it. Other chats keep the normal
  background. A fade slider keeps the messages readable, and *Remove* clears it for everyone.
  The picture is resized in the browser, then stored and served by the server like a group photo, so
  **a background is not end-to-end encrypted** (`PUT`/`DELETE /api/conversations/:id/background`).
- **♿ Accessibility** (Profile): text size (4 steps), text colour (including high contrast),
  "Read new messages aloud", and *Read aloud* in every message's menu. The settings are stored on
  this device (`frontend/lib/accessibility.js`) and applied before the page is drawn.
- **⭐ Trusted Ghosts**: favourite contacts from the chat menu, pinned at the top of the chat list.
  The list is private and only returned by `/api/auth/me`.
- **✨ Reactions** burst and pop when added. This is off when the system asks for reduced motion.
- **👥 Friends / Groups**: two pills above the chat list split one-to-one chats from groups. A
  search looks through both, so nothing hides behind the other tab, and the pill you're not on shows
  a dot when unread messages are waiting there. The choice is remembered on the device; until you
  pick one, the app shows whichever side actually has chats. On a phone the round button at the
  bottom of the list starts a new chat — or a new group, on the Groups tab.
- **⏳ Skeletons**: while the app, a conversation, a search, the GIF grid, the sticker store or a
  photo loads, a shimmering placeholder shaped like the real thing is shown instead of a spinner
  (`frontend/components/Skeleton.jsx`, and the `.skeleton` class in `globals.css`). Buttons that are
  busy still show a small spinner, because there the wait is an action, not content.

## Project structure

```
backend/
  server.js               Starts the HTTP server, Socket.IO and the MongoDB connection
  app.js                  Express app: security headers, CORS, JSON, routes, error handling
  config/db.js            MongoDB connection (retries until the database is reachable)
  config/migrate.js       Updates older data on start (safe to run every time)
  models/                 User, Conversation, Message (Mongoose)
  routes/                 auth, users, conversations (incl. groups), messages, upload, keys, calls
  middleware/             auth check, image upload, rate limits, errors
  socket/                 Socket.IO setup (presence, typing, rooms), call signaling, helpers used by routes
  utils/                  JWT cookie, file storage, publishing messages, reaction list

frontend/
  proxy.js                Sends logged-out visitors to /login
  next.config.mjs         Forwards /api, /uploads and /socket.io to the backend
  app/
    login/, register/     Auth pages
    chat/layout.js        Chat shell: list + chat side by side (desktop) or one at a time (mobile)
    chat/page.js          Empty state on desktop
    chat/[id]/page.js     A conversation
  components/
    ChatProvider.jsx      Shared state: user, socket, conversations, typing, notifications, encryption lock
    CallProvider.jsx      Calls: WebRTC connections, ringing, mic/camera
    CallScreen.jsx        Incoming call, in-call screen, minimized call bar
    ChatList.jsx          Conversation list + search
    NewGroup.jsx          "New group" panel and the people picker
    GroupInfo.jsx         Group details, members and admin actions
    SecureImage.jsx       Decrypts and shows chat photos
    ChatWindow.jsx        Messages, pagination, sending, real-time updates
    Message.jsx           A message bubble (reply quote, image, reactions, ticks, menu)
    MessageInput.jsx      Text box, emoji picker, photo button, typing events
    UserSearch.jsx        "New chat" panel
    Profile.jsx           Profile panel
    ImagePreview.jsx      Photo preview before sending + full-size viewer
    ...                   Avatar, Navbar, Notifications, DeleteDialog, ThemeToggle, AuthCard
  hooks/                  useSocket, useViewportHeight, useEscapeKey
  lib/                    e2ee (encryption), sounds, fetch helper, formatting, conversation helpers
```

## API

| Method | Route                                      | Description                                   |
| ------ | ------------------------------------------ | --------------------------------------------- |
| POST   | `/api/auth/register`                       | Create account (multipart, optional photo)    |
| POST   | `/api/auth/login`                          | Log in, sets the http-only cookie             |
| POST   | `/api/auth/logout`                         | Log out                                       |
| GET    | `/api/auth/me`                             | Current user                                  |
| PATCH  | `/api/users/me`                            | Update name / profile photo (multipart)       |
| GET    | `/api/users/search?q=`                     | Search users by name or email                 |
| GET    | `/api/conversations`                       | My conversations with unread counts           |
| POST   | `/api/conversations`                       | Open (or create) a chat with `{ userId }`     |
| POST   | `/api/conversations/groups`                | Create a group (multipart: `name`, `members`, `image?`) |
| PATCH  | `/api/conversations/:id`                   | Rename / change group photo (admins)          |
| POST   | `/api/conversations/:id/members`           | Add people `{ userIds }` (admins)             |
| DELETE | `/api/conversations/:id/members/:userId`   | Remove someone (admins), or leave with your own id |
| POST   | `/api/conversations/:id/admins/:userId`    | Make someone an admin (admins)                |
| GET    | `/api/conversations/:id`                   | One conversation                              |
| GET    | `/api/conversations/:id/messages?before=`  | 30 messages per page, older with `before`     |
| POST   | `/api/conversations/:id/read`              | Mark messages as read                         |
| POST   | `/api/messages`                            | Send `{ conversationId, ciphertext, iv, senderKey, keys, image?, replyTo?, ghostClick? }` |
| PATCH  | `/api/messages/:id`                        | Edit my text message `{ ciphertext, iv, senderKey, keys }` |
| DELETE | `/api/messages/:id?for=me\|everyone`       | Delete a message                              |
| POST   | `/api/messages/:id/reaction`               | Toggle a reaction `{ emoji }`                 |
| POST   | `/api/upload`                              | Upload an unencrypted image, returns its URL  |
| POST   | `/api/upload/encrypted`                    | Upload an encrypted chat photo (raw bytes)    |
| GET    | `/api/keys/backup`                         | My password-locked private key                |
| PUT    | `/api/keys`                                | Save my public key + locked private key (`reset: true` to replace) |
| GET    | `/api/calls/config`                        | STUN/TURN servers for calls                   |
| POST   | `/api/conversations/:id/ghost`             | Ghost / change level `{ level }` (DELETE to unghost) |
| POST   | `/api/conversations/:id/ghost/answer`      | Answer a forgiveness request `{ answer: forgive \| keep }` |
| POST   | `/api/conversations/:id/pause`             | Leave without drama `{ reason }` (DELETE to come back) |
| POST   | `/api/conversations/:id/revive`            | "Should we revive this?"; answer at `/revive/:messageId` |
| POST   | `/api/conversations/:id/badges`            | Add an inside joke `{ emoji, label }` (DELETE `/badges/:badgeId`) |
| POST   | `/api/conversations/:id/unread`            | Undo seen (3 a day)                           |
| GET    | `/api/conversations/:id/insights?tz=`      | Vibe stats + connection streak                |
| POST   | `/api/conversations/:id/miss-you`          | Tell them you miss them                       |
| POST   | `/api/conversations/:id/buzz`              | Buzz (vibrate) their phone                    |
| DELETE | `/api/conversations/:id/block`             | Unblock a chat blocked earlier                |
| PUT    | `/api/conversations/:id/nickname`          | Nickname the other person `{ nickname }` (`''` removes it) |
| POST   | `/api/conversations/:id/clear`             | Clear the chat, only for me                   |
| GET    | `/api/scheduled`                           | My scheduled messages (upcoming + last 7 days) |
| POST   | `/api/scheduled`                           | Schedule `{ sendAt, items: [{ conversationId, ciphertext, iv, senderKey, keys }] }` |
| DELETE | `/api/scheduled/:id`                       | Cancel a scheduled message that hasn't gone out |
| DELETE | `/api/conversations/:id`                   | Delete the chat for me (back with the next message) |
| POST   | `/api/messages/:id/reveal`                 | Reveal anonymous reactions (3 a day)          |
| POST   | `/api/messages/:id/opened`                 | Open a view-once Ghost Click photo or video (once per person) |
| PUT    | `/api/users/me/trusted/:userId`            | Add a Trusted Ghost (DELETE to remove)        |
| GET    | `/api/gifs?q=`                             | 🎞️ GIF search (trending when `q` is empty); `/api/gifs/config` says whether it's set up, `/api/gifs/file?url=` fetches one |
| GET    | `/api/stickers/packs`                      | Every sticker pack (never says who made one)  |
| GET    | `/api/stickers/installed`                  | The packs in my sticker picker                |
| POST   | `/api/stickers/packs`                      | Publish a pack (multipart: `name`, `images`)  |
| POST   | `/api/stickers/packs/:id/install`          | Install a pack (DELETE removes it from my picker) |
| DELETE | `/api/stickers/packs/:id`                  | Delete a pack I made — for everyone           |
| PUT    | `/api/conversations/:id/background`        | Set this chat's background (multipart: `image`, `dim`); DELETE removes it |
| GET    | `/api/health`                              | Health check: server uptime + database status. 200 when healthy, 503 when the database is down |

### Socket events (server → browser)

`message:new`, `message:deleted`, `message:reaction`, `messages:read`, `messages:delivered`,
`presence`, `typing`, `stopTyping`, `keys:changed`, `conversation:updated`, `conversation:removed`,
and for calls: `call:incoming`, `call:answered-elsewhere`, `call:participant-joined`,
`call:participant-left`, `call:declined`, `call:signal`, `call:media`, `call:ended`, `call:state`,
`call:active`.

The browser sends `typing` and `stopTyping`, and for calls `call:start`, `call:join`, `call:decline`,
`call:leave`, `call:signal` and `call:media` (each answers through a Socket.IO acknowledgement).

## Security notes

- Passwords are hashed with bcrypt and never returned by the API.
- Auth uses a signed JWT in an **http-only**, `SameSite=Lax` cookie (`Secure` in production).
- Every route reads the user id from the cookie. Sender, receiver and participant checks are done
  on the server; ids sent by the browser are never trusted.
- Only the sender can delete a message for everyone. Only group admins can add or remove people
  or change the group's name and photo.
- Messages and chat photos are end-to-end encrypted (see above).
- Helmet sets security headers on the API, and the frontend sets its own in `next.config.mjs`.
- Rate limits: login is limited **per email address** (so a password can't be brute-forced
  from many IPs), sign-up per IP, and messages/uploads per user. They're kept in memory,
  which is fine for one backend server.
- Images are re-encoded with sharp, so a renamed non-image file is rejected.
- The login form says whether the email or the password was wrong (as requested). If you'd
  rather not reveal which emails are registered, change both messages in
  `backend/routes/auth.js` to "Invalid email or password".

## Deploying

The backend needs a long-running Node server for Socket.IO (Railway, Render, Fly.io, a VPS…).
The frontend can run on the same server or elsewhere.

1. Deploy the backend with its environment variables. Set `CLIENT_URL` to the frontend's URL.
2. Build and deploy the frontend with `BACKEND_URL` set to the backend's URL.
3. If the frontend and backend are on **different servers**, set `TRUST_PROXY=1` on the backend
   so sign-up rate limiting sees visitors' real IP addresses.
4. Uploads are stored in MongoDB, so no persistent disk is needed. Keep an eye on the database size
   (voice messages and video notes add up); switch `backend/utils/storage.js` to S3/Cloudinary if it grows.
5. Point your host's health check (on Render: **Settings → Health Check Path**) at `/api/health`.

6. Set `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` so calls work on every network.

Running several backend instances would need the Socket.IO Redis adapter, a shared rate-limit store,
and shared call state (calls are tracked in memory in `backend/socket/calls.js`).
