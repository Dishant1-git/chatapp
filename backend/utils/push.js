// 🔔 Push notifications: tells a person's devices about a new message when the
// app isn't in front of them (tab in the background, browser closed, phone locked).
// Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in backend/.env to switch it on
// (generate a pair with: npx web-push generate-vapid-keys). Without them nothing is sent.
//
// Messages are end-to-end encrypted, so the server can't put their text in the
// notification: it says who it's from, never what it says.
import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import User from '../models/User.js';
import { ghostLevel } from './ghost.js';

// A notification nobody collected within a day isn't worth delivering late
const TTL_SECONDS = 24 * 60 * 60;

let configured = false;

export function pushPublicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || '').trim();
}

function ready() {
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!pushPublicKey() || !privateKey) return false;
  if (!configured) {
    const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.MAIL_FROM || 'admin@example.com'}`;
    webpush.setVapidDetails(subject, pushPublicKey(), privateKey);
    configured = true;
  }
  return true;
}

// What the notification says for a note in the chat; null = no notification
function eventLine(event) {
  switch (event.type) {
    case 'missYou':
      return '💕 Misses you';
    case 'buzz':
      return '📳 Buzzed you';
    case 'call':
      // A call that was answered, or that they turned down themselves, needs no reminder
      if (event.duration || event.reason === 'declined') return null;
      return `📞 Missed ${event.video ? 'video' : 'voice'} call`;
    default:
      return 'Something new in your chat';
  }
}

function lineFor(message) {
  if (message.messageType === 'event') return eventLine(message.event || {});
  if (message.forgiveness) return '🕊️ Forgiveness request';
  return 'New message';
}

// Of these people, the ones who want notifications from this chat
function wanting(conversation, userIds) {
  const has = (list, id) => (list || []).some((x) => String(x) === id);
  // Soft ghost: their messages arrive, the person ghosting just isn't notified
  const softGhoster = ghostLevel(conversation.ghost) === 'soft' ? String(conversation.ghost.by) : null;
  return userIds.map(String).filter((id) => !has(conversation.mutedBy, id) && id !== softGhoster);
}

// "Ann" in a one-to-one chat, "Book club" + "Ann: …" in a group
async function heading(conversation, senderId, body) {
  const sender = await User.findById(senderId).select('name').lean();
  const senderName = sender?.name || 'Someone';
  const isGroup = conversation.type === 'group';
  return {
    title: isGroup ? conversation.name || 'Group chat' : senderName,
    body: isGroup ? `${senderName}: ${body}` : body,
  };
}

// Sends one payload to every browser these people signed up. `build` makes the
// payload, and is only called if there is anyone to send it to.
async function send(userIds, build, ttl = TTL_SECONDS) {
  if (!userIds.length) return;
  const subscriptions = await PushSubscription.find({ userId: { $in: userIds } }).lean();
  if (!subscriptions.length) return;
  const payload = JSON.stringify(await build());

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, {
          TTL: ttl,
          urgency: 'high',
        });
      } catch (err) {
        // The browser unsubscribed or the subscription expired: forget it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id });
        } else {
          console.error('[push]', err.statusCode || err.message);
        }
      }
    })
  );
}

// Sends the notification for a message that was just published. Never throws:
// a push that fails must not get in the way of the message itself.
export async function pushNewMessage(conversation, message) {
  try {
    if (!ready()) return;
    const body = lineFor(message);
    if (!body) return;

    await send(wanting(conversation, message.recipients || []), async () => ({
      ...(await heading(conversation, message.senderId, body)),
      conversationId: String(conversation._id),
      messageId: String(message._id),
    }));
  } catch (err) {
    console.error('[push]', err);
  }
}

// 📞 Someone is calling: rings the devices that don't have the app open. It's
// only worth delivering while the call is still ringing (`ringSeconds`).
export async function pushIncomingCall(conversation, call, userIds, ringSeconds) {
  try {
    if (!ready()) return;
    const body = `📞 Incoming ${call.video ? 'video' : 'voice'} call`;
    await send(
      wanting(conversation, userIds),
      async () => ({
        ...(await heading(conversation, call.callerId, body)),
        type: 'call',
        conversationId: String(conversation._id),
      }),
      ringSeconds
    );
  } catch (err) {
    console.error('[push]', err);
  }
}

// 📞 The ringing is over for these people (answered or declined on another
// device, or the call finished): takes the "incoming call" notification away.
// A missed call doesn't need this — its own notification replaces the ringing one.
export async function pushCallOver(conversationId, userIds) {
  try {
    if (!ready()) return;
    await send(userIds.map(String), () => ({ type: 'call-over', conversationId: String(conversationId) }), 60);
  } catch (err) {
    console.error('[push]', err);
  }
}

