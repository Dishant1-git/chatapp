import User from '../models/User.js';
import { MAX_CIPHERTEXT_LENGTH } from '../models/Message.js';
import { MAX_GROUP_MEMBERS } from '../models/Conversation.js';

export const BASE64 = /^[A-Za-z0-9+/]+=*$/;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const MEMBER_FIELDS = 'name publicKey keyId';

// The people an encrypted message says it was locked for. A route can fetch
// them while it is still loading the conversation rather than afterwards, which
// saves a database round trip on every message. checkEncrypted only uses them
// if they turn out to be exactly the chat's members.
export function loadKeyHolders(body) {
  const ids = (Array.isArray(body?.keys) ? body.keys : []).map((k) => String(k?.userId)).filter((id) => OBJECT_ID.test(id));
  if (!ids.length || ids.length > MAX_GROUP_MEMBERS) return [];
  return User.find({ _id: { $in: ids } }).select(MEMBER_FIELDS);
}

// Checks an encrypted message's shape, and that its key was locked for every
// member of the chat with their current public key (nobody left out).
// Used when a message is sent, edited, scheduled, and again when a scheduled one goes out.
// keyHolders: the result of loadKeyHolders, if the caller fetched it already.
// Returns { keys } to store, or { status, error, code }.
export async function checkEncrypted(conversation, body, userId, keyHolders = null) {
  const ciphertext = String(body.ciphertext || '');
  const iv = String(body.iv || '');
  const senderKey = String(body.senderKey || '');

  if (!ciphertext || ciphertext.length > MAX_CIPHERTEXT_LENGTH || !BASE64.test(ciphertext)) {
    return { status: 400, error: 'Message is empty or too long.' };
  }
  if (!BASE64.test(iv) || iv.length > 32) return { status: 400, error: 'Invalid message.' };

  const participantIds = conversation.participants.map(String);
  const alreadyLoaded =
    keyHolders?.length === participantIds.length && keyHolders.every((m) => participantIds.includes(String(m._id)));
  const members = alreadyLoaded
    ? keyHolders
    : await User.find({ _id: { $in: conversation.participants } }).select(MEMBER_FIELDS);
  const me = members.find((m) => String(m._id) === String(userId));
  if (!me?.publicKey || senderKey !== me.publicKey) {
    return { status: 409, error: 'Your encryption key changed. Please reload the page.', code: 'KEYS_CHANGED' };
  }

  const withoutKeys = members.filter((m) => !m.publicKey);
  if (withoutKeys.length) {
    const names = withoutKeys.map((m) => m.name).join(', ');
    return {
      status: 409,
      error: `${names} ${withoutKeys.length > 1 ? "haven't" : "hasn't"} set up encryption yet. They'll be able to receive messages after their next login.`,
      code: 'NO_KEYS',
    };
  }

  // Every member needs a copy of the message key, locked with their current public key
  const keys = Array.isArray(body.keys) ? body.keys : [];
  const keyFor = new Map(keys.map((k) => [String(k?.userId), k]));
  const complete =
    keys.length === members.length &&
    members.every((m) => {
      const entry = keyFor.get(String(m._id));
      return (
        entry &&
        entry.keyId === m.keyId &&
        typeof entry.key === 'string' &&
        entry.key.length <= 200 &&
        BASE64.test(entry.key)
      );
    });
  if (!complete) {
    return { status: 409, error: 'The members of this chat changed. Please try again.', code: 'KEYS_CHANGED' };
  }

  return { keys: members.map((m) => ({ userId: m._id, keyId: m.keyId, key: keyFor.get(String(m._id)).key })) };
}
