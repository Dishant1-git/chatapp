// ⏳ Disappearing messages. A chat can be set so that every new message goes a
// while after it has been seen. The clock starts once everyone it was sent to
// has read it (in a group, the last person to read it starts it), and stops
// again if someone uses "undo seen". A message nobody has read doesn't go.
//
// When the time is up the message is wiped like "delete for everyone" — text,
// ciphertext, keys, files, reactions — and marked `disappeared`. The row itself
// stays with only who sent it and when, which the server knew anyway, so 🔥 streaks
// and 🧠 "read the vibe" keep adding up. Everything that lists messages skips it.
import Message from '../models/Message.js';
import { isDatabaseConnected } from '../config/db.js';
import { emitToConversation } from '../socket/io.js';
import { deleteImage } from './storage.js';

const HOUR = 60 * 60;

// "Instantly": gone right after it's seen. A few seconds rather than none, or
// it would be wiped before the person who opened it could read it.
const INSTANT = 10;

// Seconds after being seen; 0 = off. Keep in sync with DISAPPEAR_OPTIONS in
// frontend/lib/disappearing.js
export const DISAPPEAR_OPTIONS = [0, INSTANT, HOUR, 2 * HOUR, 4 * HOUR, 8 * HOUR, 24 * HOUR];

// The shortest timer has to be wiped on time, so the sweep runs more often than it
const SWEEP_EVERY_MS = 5 * 1000;

// How many expired messages one pass handles; the next pass picks up the rest
const SWEEP_BATCH = 500;

// How long a message published now lives once it's seen (seconds, 0 = it stays).
// Notes in the chat (calls, "X turned on disappearing messages", group changes)
// stay, and so does a forgiveness request: the ghoster still has to answer it.
export function disappearAfterFor(conversation, fields) {
  if (fields.messageType === 'event' || fields.forgiveness) return 0;
  return conversation.disappearAfter || 0;
}

// Tells the browsers which of these messages are now counting down, so they can
// take them off the screen on time: `messages:expiring` { messages: [{ _id, expiresAt }] }
export async function announceCountdowns(conversationId, messageIds) {
  if (!messageIds.length) return;
  const counting = await Message.find({ _id: { $in: messageIds }, expiresAt: { $ne: null } })
    .select('_id expiresAt')
    .lean();
  if (!counting.length) return;
  emitToConversation(conversationId, 'messages:expiring', {
    conversationId: String(conversationId),
    messages: counting.map((m) => ({ _id: String(m._id), expiresAt: m.expiresAt })),
  });
}

// Only messages that haven't disappeared, for queries that list them. Something
// whose time is up but that the sweep hasn't reached yet counts as gone.
export function stillVisible(now = new Date()) {
  return { disappeared: { $ne: true }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}

let running = false;

export function startDisappearingSweep() {
  sweepExpired();
  setInterval(sweepExpired, SWEEP_EVERY_MS).unref();
}

// Wipes every message whose time is up and tells the people in those chats
export async function sweepExpired() {
  if (running || !isDatabaseConnected()) return;
  running = true;
  try {
    while (true) {
      const expired = await Message.find({ expiresAt: { $lte: new Date() } })
        .select('_id conversationId image media')
        .limit(SWEEP_BATCH)
        .lean();
      if (!expired.length) break;

      await Message.updateMany(
        { _id: { $in: expired.map((m) => m._id) } },
        {
          $set: {
            disappeared: true,
            expiresAt: null, // out of the sweep's index
            text: '',
            ciphertext: '',
            iv: '',
            senderKey: '',
            keys: [],
            image: '',
            media: '',
            reactions: [],
            replyTo: null,
            // Nothing left to read, so it no longer counts as unread
            isDelivered: true,
            isRead: true,
          },
        }
      );

      for (const m of expired) {
        if (m.image) deleteImage(m.image);
        if (m.media) deleteImage(m.media);
      }

      // One event per chat, however many went at once
      const byConversation = new Map();
      for (const m of expired) {
        const id = String(m.conversationId);
        if (!byConversation.has(id)) byConversation.set(id, []);
        byConversation.get(id).push(String(m._id));
      }
      for (const [conversationId, messageIds] of byConversation) {
        emitToConversation(conversationId, 'messages:disappeared', { conversationId, messageIds });
      }

      if (expired.length < SWEEP_BATCH) break;
    }
  } catch (err) {
    console.error('[disappearing]', err);
  } finally {
    running = false;
  }
}
