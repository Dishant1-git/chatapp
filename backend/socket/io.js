// Gives the REST routes access to the Socket.IO server, so they can
// push events to users after saving changes to the database.

let io = null;

// userId -> number of open connections (tabs/devices)
export const onlineUsers = new Map();

export const userRoom = (userId) => `user:${userId}`;
export const conversationRoom = (conversationId) => `conversation:${conversationId}`;

export function setIO(server) {
  io = server;
}

export function getIO() {
  return io;
}

export function isUserOnline(userId) {
  return (onlineUsers.get(String(userId)) || 0) > 0;
}

export function emitToConversation(conversationId, event, data) {
  io?.to(conversationRoom(conversationId)).emit(event, data);
}
