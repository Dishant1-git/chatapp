import mongoose from 'mongoose';

// Keep in sync with frontend/lib/moods.js
export const MOODS = ['', 'barely', 'overthinking', 'dontText', 'yap', 'social', 'disappearing'];

// The user's end-to-end encryption key pair. The public key is shared with
// everyone who chats with them. The private key never reaches the server in
// readable form: the browser locks it with the user's PIN (which the server
// never sees) and only that locked copy is stored here, so the user can
// unlock it on any device.
const keyBackupSchema = new mongoose.Schema(
  {
    encryptedPrivateKey: { type: String, required: true },
    salt: { type: String, required: true },
    iv: { type: String, required: true },
    iterations: { type: Number, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false means the password is never returned unless we ask for it
    password: { type: String, required: true, select: false },
    profileImage: { type: String, default: '' },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    // Base64 SPKI public key (ECDH P-256), and a short hash of it. Senders
    // include the keyId so the server can tell when they used an old key.
    publicKey: { type: String, default: '' },
    keyId: { type: String, default: '' },
    // Only returned to the owner, by GET /api/keys/backup
    keyBackup: { type: keyBackupSchema, default: null, select: false },
    // Shown next to the name instead of a plain "online"
    mood: { type: String, enum: MOODS, default: '' },
    // Private: only the owner ever sees these (GET /api/auth/me)
    stats: {
      ghosted: { type: Number, default: 0 },
      forgave: { type: Number, default: 0 },
      apologies: { type: Number, default: 0 },
      revived: { type: Number, default: 0 },
    },
    // Daily allowances for "reveal reaction" and "undo seen"
    daily: {
      type: new mongoose.Schema(
        { day: String, reveals: { type: Number, default: 0 }, undoSeen: { type: Number, default: 0 } },
        { _id: false }
      ),
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

// Used by user search
userSchema.index({ name: 1 });

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.password;
    delete ret.keyBackup;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

export default User;
