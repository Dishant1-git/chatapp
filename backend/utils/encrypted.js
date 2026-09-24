import User from '../models/User.js';

export const BASE64 = /^[A-Za-z0-9+/]+=*$/;

// Checks an encrypted message's shape, and that its key was locked for every
// member of the chat with their current public key (nobody left out).
// Used when a message is sent, edited, scheduled, and again when a scheduled one goes out.
// Returns { keys } to store, or { status, error, code }.
export async function checkEncrypted(conversation, body, userId) {
  const ciphertext = String(body.ciphertext || '');
  const iv = String(body.iv || '');
  const senderKey = String(body.senderKey || '');

  if (!ciphertext || ciphertext.length > 40000 || !BASE64.test(ciphertext)) {
    return { status: 400, error: 'Message is empty or too long.' };
  }
  if (!BASE64.test(iv) || iv.length > 32) return { status: 400, error: 'Invalid message.' };

  const members = await User.find({ _id: { $in: conversation.participants } }).select('name publicKey keyId');
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
