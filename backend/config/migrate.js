import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

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
}
