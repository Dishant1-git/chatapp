import { api } from './client';
import { createKeys, relockKeys, unlockKeys } from './e2ee';

// Runs right after logging in or signing up, while we still have the password.
// Unlocks the user's encryption key with it (or creates one the first time),
// so there is never a separate PIN to type. The unlocked key is then kept on
// this device, so reloading the page doesn't need the password again.
export async function prepareKeys(user, password) {
  let stored = null;
  try {
    stored = await api('/api/keys/backup');
  } catch (err) {
    if (err.status !== 404) throw err; // 404: no keys yet
  }

  if (stored?.backup?.kind === 'password') {
    try {
      await unlockKeys(user._id, stored, password);
      return;
    } catch {
      // Couldn't open it with this password — fall through and start fresh
    }
  }

  // First time, or an older account whose key was locked with a PIN (which we
  // can't open without it): make new keys, locked with the password
  const { body, activate } = await createKeys(user._id, password);
  body.backup.kind = 'password';
  await api('/api/keys', { method: 'PUT', body: { ...body, reset: Boolean(stored) } });
  await activate();
}

// 🔑 Changing the password from inside the app, where the current one is known:
// the same encryption key is locked again with the new password, so nothing
// becomes unreadable. Returns false if there were no keys to move over.
export async function moveKeysToNewPassword(user, oldPassword, newPassword) {
  let stored = null;
  try {
    stored = await api('/api/keys/backup');
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  if (!stored?.backup) return false;

  const body = await relockKeys(user._id, stored, oldPassword, newPassword);
  await api('/api/keys', { method: 'PUT', body: { ...body, reset: true } });
  return true;
}
