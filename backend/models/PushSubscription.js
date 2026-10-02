import mongoose from 'mongoose';

// 🔔 One browser that agreed to get push notifications for an account.
// The endpoint is the address the browser's push service gave it; the keys
// encrypt what we send so only that browser can read it.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 256 },
      auth: { type: String, required: true, maxlength: 128 },
    },
  },
  { timestamps: true }
);

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
