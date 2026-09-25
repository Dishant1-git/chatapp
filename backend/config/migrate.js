import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { freeUsernameFrom } from '../utils/username.js';

// Brings data from before groups and encryption up to date. Safe to run on
// every start: it only touches documents that haven't been converted yet.
export async function migrate() {
  await Conversation.updateMany({ type: { $exists: false } }, { $set: { type: 'direct' } });

  // One-to-one messages had a single receiverId and isDelivered/isRead flags.
  // They now list their recipients and who has received/read them.
  const result = await Message.collection.updateMany({ recipients: { $exists: false } }, [
    {
      $set: {
        recipients: ['$receiverId'],
        deliveredTo: { $cond: ['$isDelivered', ['$receiverId'], []] },
        readBy: { $cond: ['$isRead', ['$receiverId'], []] },
      },
    },
    { $unset: 'receiverId' },
  ]);

  if (result.modifiedCount > 0) console.log(`> Migrated ${result.modifiedCount} messages`);

  // 🏷️ Accounts from before usernames get one made from their name or email
  const withoutUsername = await User.find({ $or: [{ username: { $exists: false } }, { username: null }] })
    .select('name email')
    .lean();
  for (const person of withoutUsername) {
    const username = await freeUsernameFrom(person.name || String(person.email).split('@')[0]);
    await User.updateOne({ _id: person._id }, { $set: { username } });
  }
  if (withoutUsername.length > 0) console.log(`> Gave ${withoutUsername.length} accounts a username`);

  // ✉️ Accounts that existed before email verification keep working as they are
  const verified = await User.updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true } });
  if (verified.modifiedCount > 0) console.log(`> ${verified.modifiedCount} existing accounts marked as verified`);
}
