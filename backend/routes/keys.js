import { Router } from 'express';
import crypto from 'node:crypto';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { requireAuth } from '../middleware/auth.js';
import { keyLimiter } from '../middleware/rateLimits.js';
import { emitToConversation } from '../socket/io.js';

const router = Router();
router.use(requireAuth);

const BASE64 = /^[A-Za-z0-9+/]+=*$/;

function isBase64(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && BASE64.test(value);
}

// Short fingerprint of a public key. Senders send it along with each locked
// message key, so the server can spot a message locked with an outdated key.
export function computeKeyId(publicKey) {
  return crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
}

// GET /api/keys/backup — my PIN-locked private key, to unlock it on this device
router.get('/backup', async (req, res) => {
  const user = await User.findById(req.userId).select('+keyBackup publicKey keyId');
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!user.keyBackup) return res.status(404).json({ error: 'Encryption is not set up yet.' });
  res.json({ publicKey: user.publicKey, keyId: user.keyId, backup: user.keyBackup });
});

// PUT /api/keys { publicKey, backup: { encryptedPrivateKey, salt, iv, iterations }, reset? }
// Saves a new key pair made in the browser. Replacing existing keys needs
// reset: true, because messages locked with the old key can't be read anymore.
router.put('/', keyLimiter, async (req, res) => {
  const { publicKey, backup, reset } = req.body || {};

  if (!isBase64(publicKey, 400)) return res.status(400).json({ error: 'Invalid public key.' });
  if (
    !backup ||
    !isBase64(backup.encryptedPrivateKey, 1000) ||
    !isBase64(backup.salt, 64) ||
    !isBase64(backup.iv, 64) ||
    !Number.isInteger(backup.iterations) ||
    backup.iterations < 100000 ||
    backup.iterations > 10000000
  ) {
    return res.status(400).json({ error: 'Invalid key backup.' });
  }

  const user = await User.findById(req.userId).select('publicKey');
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.publicKey && reset !== true) {
    return res.status(409).json({ error: 'Encryption is already set up on this account.' });
  }

  const keyId = computeKeyId(publicKey);
  const updated = await User.findByIdAndUpdate(
    req.userId,
    {
      publicKey,
      keyId,
      keyBackup: {
        encryptedPrivateKey: backup.encryptedPrivateKey,
        salt: backup.salt,
        iv: backup.iv,
        iterations: backup.iterations,
      },
    },
    { returnDocument: 'after' }
  );

  // Let the people I chat with pick up my new key before they send me anything
  const conversations = await Conversation.find({ participants: req.userId }).select('_id');
  conversations.forEach((c) =>
    emitToConversation(c._id, 'keys:changed', { userId: req.userId, publicKey, keyId })
  );

  res.json({ user: updated });
});

export default router;
