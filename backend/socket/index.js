import { Server } from 'socket.io';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { TOKEN_COOKIE, verifyToken } from '../utils/jwt.js';
import { setIO, onlineUsers, userRoom, conversationRoom } from './io.js';

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
    maxHttpBufferSize: 1e5, // clients only send small typing events
  });
  setIO(io);

  // Authenticate every connection using the same http-only cookie as the API
  io.use((socket, next) => {
    const userId = verifyToken(readCookie(socket.handshake.headers.cookie, TOKEN_COOKIE));
    if (!userId) return next(new Error('unauthorized'));
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

  if (!isFirstConnection) return;

  await User.findByIdAndUpdate(userId, { isOnline: true });
  if (rooms.length) io.to(rooms).emit('presence', { userId, isOnline: true });

  // Messages sent to this user while they were offline are now delivered
  const conversationIds = await Message.distinct('conversationId', {
    receiverId: userId,
    isDelivered: false,
  });
  if (conversationIds.length) {
    await Message.updateMany({ receiverId: userId, isDelivered: false }, { isDelivered: true });
    conversationIds.forEach((conversationId) => {
      io.to(conversationRoom(conversationId)).emit('messages:delivered', {
        conversationId: String(conversationId),
        receiverId: userId,
      });
    });
  }
}
