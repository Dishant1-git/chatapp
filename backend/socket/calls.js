import crypto from 'node:crypto';
import { isValidObjectId } from 'mongoose';
import Conversation from '../models/Conversation.js';
import { publishEvent } from '../utils/publish.js';
import { ghostLevel } from '../utils/ghost.js';
import { getIO, userRoom, conversationRoom } from './io.js';

// Voice and video calls use WebRTC: audio and video go directly between the
// browsers (or through a TURN relay), encrypted by WebRTC itself. The server
// only passes along the setup messages ("signals") and keeps track of who is
// in which call. Group calls connect every member to every other member,
// which works well for a handful of people.

export const MAX_CALL_PARTICIPANTS = 6;
const RING_TIMEOUT_MS = 45 * 1000;

// callId -> {
//   id, conversationId, video, callerId, createdAt, answeredAt,
//   participants: Map<userId, socketId>, invited: Set<userId>, declined: Set<userId>,
//   ringTimer, hadOthers
// }
const calls = new Map();
// userId -> callId of the call they are in
const userCalls = new Map();

function activeCallFor(conversationId) {
  for (const call of calls.values()) {
    if (call.conversationId === String(conversationId)) return call;
  }
  return null;
}

function publicCall(call) {
  return {
    callId: call.id,
    conversationId: call.conversationId,
    video: call.video,
    callerId: call.callerId,
    participants: [...call.participants.keys()],
    startedAt: call.answeredAt,
  };
}

// Tells every member of the conversation whether a call is going on,
// so the chat can show a "Join" button
function broadcastState(call, active) {
  getIO()
    ?.to(conversationRoom(call.conversationId))
    .emit('call:state', { conversationId: call.conversationId, active, call: active ? publicCall(call) : null });
}

function emitToParticipants(call, event, data, exceptUserId = null) {
  const io = getIO();
  for (const [userId, socketId] of call.participants) {
    if (userId !== exceptUserId) io?.to(socketId).emit(event, data);
  }
}

async function endCall(call, reason) {
  if (!calls.has(call.id)) return;
  calls.delete(call.id);
  clearTimeout(call.ringTimer);
  for (const userId of call.participants.keys()) {
    if (userCalls.get(userId) === call.id) userCalls.delete(userId);
  }

  const io = getIO();
  // Everyone who was invited: stops ringing, closes the call screen
  const everyone = new Set([...call.invited, ...call.participants.keys(), call.callerId]);
  everyone.forEach((userId) => io?.to(userRoom(userId)).emit('call:ended', { callId: call.id, reason }));
  broadcastState(call, false);

  // Leave a note in the chat: "Voice call · 3:12" or "Missed video call"
  try {
    const conversation = await Conversation.findById(call.conversationId);
    if (conversation) {
      const duration = call.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0;
      await publishEvent(conversation, call.callerId, { type: 'call', video: call.video, duration });
    }
  } catch (err) {
    console.error('[calls] failed to save call log:', err.message);
  }
}

function leaveCall(call, userId, socketId = null) {
  // Only the tab that is actually in the call can leave it
  if (!call.participants.has(userId)) return;
  if (socketId && call.participants.get(userId) !== socketId) return;

  call.participants.delete(userId);
  if (userCalls.get(userId) === call.id) userCalls.delete(userId);
  emitToParticipants(call, 'call:participant-left', { callId: call.id, userId });

  // Nobody left to talk to: the call is over. Before anyone answered,
  // the caller hanging up cancels the call.
  if (call.participants.size < 2 && (call.hadOthers || call.participants.size === 0)) {
    endCall(call, 'ended');
  } else {
    broadcastState(call, true);
  }
}

// Used when someone is removed from (or leaves) a group
export function leaveCallsFor(conversationId, userId) {
  const call = activeCallFor(conversationId);
  if (!call) return;
  call.invited.delete(String(userId));
  if (call.participants.has(String(userId))) {
    getIO()?.to(call.participants.get(String(userId))).emit('call:ended', { callId: call.id, reason: 'removed' });
    leaveCall(call, String(userId));
  }
}

// Active calls in these conversations, sent to a socket when it connects
export function activeCallsIn(conversationIds) {
  const ids = new Set(conversationIds.map(String));
  return [...calls.values()].filter((c) => ids.has(c.conversationId)).map(publicCall);
}

export function registerCallHandlers(io, socket) {
  const userId = socket.userId;

  // Every handler answers through the callback ("ack"), so the browser knows
  // whether it worked. Misbehaving clients are ignored.
  function on(event, handler) {
    socket.on(event, async (data = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        await handler(data || {}, reply);
      } catch (err) {
        console.error(`[calls] ${event} failed:`, err.message);
        reply({ error: 'Something went wrong with the call.' });
      }
    });
  }

  // { conversationId, video } → { call } — starts ringing the other members.
  // If a call is already going on in this chat, you're asked to join it instead.
  on('call:start', async ({ conversationId, video }, reply) => {
    if (!isValidObjectId(conversationId)) return reply({ error: 'Conversation not found.' });
    if (userCalls.has(userId)) return reply({ error: "You're already in a call." });

    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId }).select(
      'participants ghost pausedBy'
    );
    if (!conversation) return reply({ error: 'Conversation not found.' });

    // Ghosted (anything but soft) or they stepped away: no calls
    const ghostedByOther = conversation.ghost?.by && String(conversation.ghost.by) !== userId;
    if (ghostedByOther && ghostLevel(conversation.ghost) !== 'soft') {
      return reply({ error: "You've been ghosted. You can't call them." });
    }
    if (conversation.pausedBy?.by) {
      return reply({ error: String(conversation.pausedBy.by) === userId ? 'You stepped away from this chat.' : "They're taking some space right now." });
    }

    const existing = activeCallFor(conversationId);
    if (existing) return reply({ existing: publicCall(existing) });

    // In big groups everyone rings, but only the first few who answer can join
    const others = conversation.participants.map(String).filter((id) => id !== userId);
    if (others.length > 0 && others.every((id) => userCalls.has(id))) {
      return reply({ error: others.length === 1 ? "They're on another call." : 'Everyone is on another call.' });
    }
    const call = {
      id: crypto.randomUUID(),
      conversationId: String(conversationId),
      video: Boolean(video),
      callerId: userId,
      createdAt: Date.now(),
      answeredAt: null,
      participants: new Map([[userId, socket.id]]),
      invited: new Set(others),
      declined: new Set(),
      hadOthers: false,
      ringTimer: null,
    };
    calls.set(call.id, call);
    userCalls.set(userId, call.id);

    // Nobody answered in time
    call.ringTimer = setTimeout(() => {
      if (!call.hadOthers) endCall(call, 'no-answer');
    }, RING_TIMEOUT_MS);

    const incoming = publicCall(call);
    others.forEach((id) => {
      // People already in another call don't get a ringing screen
      if (!userCalls.has(id)) io.to(userRoom(id)).emit('call:incoming', incoming);
    });
    broadcastState(call, true);

    reply({ call: incoming });
  });

  // { callId } → { call } — answer (or join a call that's already going).
  // The joiner then sends a WebRTC offer to everyone already in the call.
  on('call:join', async ({ callId }, reply) => {
    const call = calls.get(String(callId));
    if (!call) return reply({ error: 'This call has ended.' });
    if (call.participants.has(userId)) return reply({ error: "You're already in this call." });
    if (userCalls.has(userId)) return reply({ error: "You're already in another call." });
    if (call.participants.size >= MAX_CALL_PARTICIPANTS) {
      return reply({ error: `This call is full (max ${MAX_CALL_PARTICIPANTS} people).` });
    }

    // Membership may have changed since the call started
    const isMember = await Conversation.exists({ _id: call.conversationId, participants: userId });
    if (!isMember || !calls.has(call.id)) return reply({ error: 'This call has ended.' });

    const existingParticipants = [...call.participants.keys()];
    call.participants.set(userId, socket.id);
    call.declined.delete(userId);
    call.hadOthers = true;
    call.answeredAt ??= Date.now();
    clearTimeout(call.ringTimer);
    userCalls.set(userId, call.id);

    emitToParticipants(call, 'call:participant-joined', { callId: call.id, userId }, userId);
    // Stop the ringing on this user's other tabs and devices
    socket.to(userRoom(userId)).emit('call:answered-elsewhere', { callId: call.id });
    broadcastState(call, true);

    reply({ call: publicCall(call), peers: existingParticipants });
  });

  // { callId } — don't answer. A one-to-one call ends right away.
  on('call:decline', ({ callId }, reply) => {
    const call = calls.get(String(callId));
    if (!call || !call.invited.has(userId)) return reply({ ok: true });

    call.declined.add(userId);
    socket.to(userRoom(userId)).emit('call:answered-elsewhere', { callId: call.id });
    emitToParticipants(call, 'call:declined', { callId: call.id, userId });

    const everyoneDeclined = [...call.invited].every((id) => call.declined.has(id));
    if (!call.hadOthers && everyoneDeclined) endCall(call, 'declined');
    reply({ ok: true });
  });

  on('call:leave', ({ callId }, reply) => {
    const call = calls.get(String(callId));
    if (call) leaveCall(call, userId, socket.id);
    reply({ ok: true });
  });

  // { callId, to, data } — relays an offer, answer or network candidate
  // to one other person in the same call
  on('call:signal', ({ callId, to, data }, reply) => {
    const call = calls.get(String(callId));
    if (!call || call.participants.get(userId) !== socket.id) return reply({ error: 'Not in this call.' });
    const target = call.participants.get(String(to));
    if (!target) return reply({ error: 'That person has left the call.' });
    if (JSON.stringify(data || {}).length > 20000) return reply({ error: 'Signal too large.' });

    io.to(target).emit('call:signal', { callId: call.id, from: userId, data });
    reply({ ok: true });
  });

  // { callId, audio, video } — mic/camera switched on or off, for the others' UI
  on('call:media', ({ callId, audio, video }, reply) => {
    const call = calls.get(String(callId));
    if (!call || call.participants.get(userId) !== socket.id) return reply({ ok: false });
    emitToParticipants(
      call,
      'call:media',
      { callId: call.id, userId, audio: Boolean(audio), video: Boolean(video) },
      userId
    );
    reply({ ok: true });
  });

  // Closing the tab that's in a call means leaving it
  socket.on('disconnect', () => {
    const callId = userCalls.get(userId);
    const call = callId && calls.get(callId);
    if (call) leaveCall(call, userId, socket.id);
  });
}
