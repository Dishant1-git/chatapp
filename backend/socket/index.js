import { Server } from 'socket.io';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message, { REFRESH_TICKS } from '../models/Message.js';
import { TOKEN_COOKIE, verifyToken } from '../utils/jwt.js';
import { setIO, onlineUsers, userRoom, conversationRoom } from './io.js';
import { registerCallHandlers, activeCallsIn } from './calls.js';

function readCookie(cookieHeader = '', name) {
  const match = cookieHeader.split(';').find((part) => part.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=').trim()) : null;
}

// Rooms for all conversations this socket belongs to
function getConversationRooms(socket) {
  return [...socket.rooms].filter((room) => room.startsWith('conversation:'));
}

export function setupSocket(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    maxHttpBufferSize: 1e5, // clients only send typing events and call signals
  });
  setIO(io);

  // Authenticate every connection using the same http-only cookie as the API.
  // ✉️ An account whose email hasn't been confirmed doesn't get a socket either.
  io.use(async (socket, next) => {
    const userId = verifyToken(readCookie(socket.handshake.headers.cookie, TOKEN_COOKIE));
    if (!userId) return next(new Error('unauthorized'));
    try {
      const user = await User.findById(userId).select('emailVerified').lean();
      if (!user) return next(new Error('unauthorized'));
      if (!user.emailVerified) return next(new Error('email not verified'));
    } catch {
      return next(new Error('unauthorized'));
    }
    socket.userId = userId;
    next();
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;

    // Count the connection straight away (before any await) so a quick
    // disconnect can't run before we've counted it. A user with two tabs
    // open only goes offline when both are closed.
    const connections = (onlineUsers.get(userId) || 0) + 1;
    onlineUsers.set(userId, connections);

    socket.join(userRoom(userId));

    // Event handlers are attached right away (before the database work below
    // finishes) so no early events from the client are missed.

    registerCallHandlers(io, socket);

    // Typing events are only relayed to rooms the socket has joined,
    // and it only joins rooms of conversations it is a participant of.
    socket.on('typing', ({ conversationId } = {}) => {
      const room = conversationRoom(conversationId);
      if (socket.rooms.has(room)) socket.to(room).emit('typing', { conversationId, userId });
    });

    socket.on('stopTyping', ({ conversationId } = {}) => {
      const room = conversationRoom(conversationId);
      if (socket.rooms.has(room)) socket.to(room).emit('stopTyping', { conversationId, userId });
    });

    // "👻 They typed something... then disappeared." Only the fact is shared —
    // never what was typed. At most once a minute per chat.
    const lastAlmostSaid = new Map();
    socket.on('almostSaid', ({ conversationId } = {}) => {
      const room = conversationRoom(conversationId);
      if (!socket.rooms.has(room)) return;
      if (Date.now() - (lastAlmostSaid.get(room) || 0) < 60 * 1000) return;
      lastAlmostSaid.set(room, Date.now());
      socket.to(room).emit('almostSaid', { conversationId, userId });
    });

    // "disconnecting" fires while socket.rooms is still filled in
    socket.on('disconnecting', async () => {
      const rooms = getConversationRooms(socket);
      const remaining = (onlineUsers.get(userId) || 1) - 1;

      if (remaining > 0) {
        onlineUsers.set(userId, remaining);
        return;
      }

      onlineUsers.delete(userId);
      const lastSeen = new Date();

      try {
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
      } catch (err) {
        console.error('[socket] failed to save last seen:', err.message);
      }

      if (rooms.length) {
        // Also tell the other person to hide the typing indicator
        rooms.forEach((room) =>
          socket.to(room).emit('stopTyping', { conversationId: room.split(':')[1], userId })
        );
        io.to(rooms).emit('presence', { userId, isOnline: false, lastSeen });
      }
    });

    try {
      await joinRoomsAndGoOnline(io, socket, connections === 1);
    } catch (err) {
      console.error('[socket] connection setup failed:', err.message);
    }
  });

  return io;
}

async function joinRoomsAndGoOnline(io, socket, isFirstConnection) {
  const userId = socket.userId;

  const conversations = await Conversation.find({ participants: userId }).select('_id');
  const rooms = conversations.map((c) => conversationRoom(c._id));

  // The user may have closed the tab while we were querying
  if (!socket.connected) return;
  socket.join(rooms);

  // Calls going on in my chats (so the chat can offer "Join")
  const calls = activeCallsIn(conversations.map((c) => c._id));
  if (calls.length) socket.emit('call:active', { calls });

  if (!isFirstConnection) return;

  await User.findByIdAndUpdate(userId, { isOnline: true });
  if (rooms.length) io.to(rooms).emit('presence', { userId, isOnline: true });

  // Messages sent to this user while they were offline are now delivered
  const me = new mongoose.Types.ObjectId(userId);
  const undelivered = { recipients: me, deliveredTo: { $ne: me } };
  const conversationIds = await Message.distinct('conversationId', undelivered);
  if (conversationIds.length) {
    await Message.updateMany(
      undelivered,
      [{ $set: { deliveredTo: { $setUnion: [{ $ifNull: ['$deliveredTo', []] }, [me]] } } }, ...REFRESH_TICKS],
      { updatePipeline: true }
    );
    conversationIds.forEach((conversationId) => {
      io.to(conversationRoom(conversationId)).emit('messages:delivered', {
        conversationId: String(conversationId),
        receiverId: userId,
      });
    });
  }
}
