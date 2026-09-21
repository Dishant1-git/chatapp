# Chatter

A real-time one-to-one chat app. The **frontend** is Next.js and the **backend** is
Express + Socket.IO + MongoDB, each in its own folder.
It's inspired by the feel of WhatsApp on mobile: a full-screen chat list, full-screen
conversations, and a clean two-column layout on desktop.

**Features:** register/login, profiles with photos, user search, private conversations,
real-time messages, online status and last seen, typing indicator, sent/delivered/read ticks,
photo sharing, reactions, replies, in-app notifications with unread counts, delete for
me/everyone, message pagination, and light/dark mode.

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
| `UPLOAD_DIR`       | `uploads`                            | Folder where uploaded images are stored                |
| `TRUST_PROXY`      | `1`                                  | Optional. Set to `1` when the frontend runs on another server |
| `COOKIE_SAME_SITE` | `none`                               | Optional. Only if the browser calls the API directly on another domain |

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
- **Sending a message:** the browser calls `POST /api/messages`. The backend checks that you're
  in the conversation, saves the message, and **then** emits `message:new` to the conversation's
  Socket.IO room. Messages are never broadcast before they're saved.
- **Socket.IO** pushes updates (new messages, reactions, deletes, read receipts, presence) and
  relays typing events. It's authenticated with the same http-only cookie as the API.
- **Rooms:** each socket joins `user:<id>` and one `conversation:<id>` room per conversation,
  so events only go to the two people in a chat.
- **Online status** is tracked per user (counting open tabs), saved to MongoDB, and `lastSeen`
  is written when the last tab closes.
- **Ticks:** a message is *delivered* if the receiver has the app open when it's sent (or as soon
  as they connect), and *read* when they open the conversation.
- **Images** are checked (type and 5 MB limit), resized and converted to WEBP with `sharp`,
  stored in `UPLOAD_DIR` and served at `/uploads/<name>.webp`. Only
  `backend/utils/storage.js` knows about this, so switching to S3 or Cloudinary means changing
  `saveImage()` only.

## Project structure

```
backend/
  server.js               Starts the HTTP server, Socket.IO and the MongoDB connection
  app.js                  Express app: security headers, CORS, JSON, routes, error handling
  config/db.js            MongoDB connection (retries until the database is reachable)
  models/                 User, Conversation, Message (Mongoose)
  routes/                 auth, users, conversations, messages, upload
  middleware/             auth check, image upload, rate limits, errors
  socket/                 Socket.IO setup (presence, typing, rooms) + helpers used by routes
  utils/                  JWT cookie, image storage, reaction list

frontend/
  proxy.js                Sends logged-out visitors to /login
  next.config.mjs         Forwards /api, /uploads and /socket.io to the backend
  app/
    login/, register/     Auth pages
    chat/layout.js        Chat shell: list + chat side by side (desktop) or one at a time (mobile)
    chat/page.js          Empty state on desktop
    chat/[id]/page.js     A conversation
  components/
    ChatProvider.jsx      Shared state: user, socket, conversations, typing, notifications
    ChatList.jsx          Conversation list + search
    ChatWindow.jsx        Messages, pagination, sending, real-time updates
    Message.jsx           A message bubble (reply quote, image, reactions, ticks, menu)
    MessageInput.jsx      Text box, emoji picker, photo button, typing events
    UserSearch.jsx        "New chat" panel
    Profile.jsx           Profile panel
    ImagePreview.jsx      Photo preview before sending + full-size viewer
    ...                   Avatar, Navbar, Notifications, DeleteDialog, ThemeToggle, AuthCard
  hooks/                  useSocket, useViewportHeight, useEscapeKey
  lib/                    fetch helper, date formatting, reaction list
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
| GET    | `/api/conversations/:id`                   | One conversation                              |
| GET    | `/api/conversations/:id/messages?before=`  | 30 messages per page, older with `before`     |
| POST   | `/api/conversations/:id/read`              | Mark messages as read                         |
| POST   | `/api/messages`                            | Send `{ conversationId, text?, image?, replyTo? }` |
| DELETE | `/api/messages/:id?for=me\|everyone`       | Delete a message                              |
| POST   | `/api/messages/:id/reaction`               | Toggle a reaction `{ emoji }`                 |
| POST   | `/api/upload`                              | Upload a chat image, returns its URL          |
| GET    | `/api/health`                              | Health check: server uptime + database status. 200 when healthy, 503 when the database is down |

### Socket events (server → browser)

`message:new`, `message:deleted`, `message:reaction`, `messages:read`, `messages:delivered`,
`presence`, `typing`, `stopTyping`. The browser only sends `typing` and `stopTyping`.

## Security notes

- Passwords are hashed with bcrypt and never returned by the API.
- Auth uses a signed JWT in an **http-only**, `SameSite=Lax` cookie (`Secure` in production).
- Every route reads the user id from the cookie. Sender, receiver and participant checks are done
  on the server; ids sent by the browser are never trusted.
- Only the sender can delete a message for everyone.
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
4. Make `UPLOAD_DIR` a persistent disk, or switch `backend/utils/storage.js` to S3/Cloudinary.
5. Point your host's health check (on Render: **Settings → Health Check Path**) at `/api/health`.

Running several backend instances would need the Socket.IO Redis adapter and a shared rate-limit store.
