import mongoose from 'mongoose';
import crypto from 'node:crypto';

// 🔐 The six-digit code sent to a new account's email address.
// Only a hash of it is stored, the same way passwords are, and MongoDB deletes
// the document by itself once it expires (the TTL index below).
const emailCodeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    // Wrong guesses; too many and the code is thrown away
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// MongoDB removes expired codes on its own (checked about once a minute)
emailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

export function makeCode() {
  // 000000–999999, evenly spread
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// Codes are compared byte by byte in constant time, so timing gives nothing away
export function codeMatches(code, codeHash) {
  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(String(codeHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const EmailCode = mongoose.model('EmailCode', emailCodeSchema);

export default EmailCode;
