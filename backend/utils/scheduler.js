// ⏰ Sends scheduled messages when their time comes. Runs inside the API server:
// every CHECK_EVERY_MS it publishes whatever is due. Each copy is checked again
// right before it goes out (ghosting, pauses, blocks, encryption keys), since
// things may have changed since it was scheduled.
import Conversation, { blockError } from '../models/Conversation.js';
import ScheduledMessage from '../models/ScheduledMessage.js';
import { checkEncrypted } from './encrypted.js';
import { ghostLevel } from './ghost.js';
import { publishMessage } from './publish.js';
import { isDatabaseConnected } from '../config/db.js';
import { getIO, isUserOnline, userRoom } from '../socket/io.js';
import { resumeConversation } from '../routes/conversations.js';

const CHECK_EVERY_MS = 15 * 1000;

let running = false;

export function startScheduler() {
  // A crash while sending leaves messages "sending": pick them up again.
  // Copies that already went out are marked "sent" and aren't sent twice.
  ScheduledMessage.updateMany({ status: 'sending' }, { status: 'pending' })
    .catch(() => {})
    .finally(() => runDueScheduled());
  setInterval(runDueScheduled, CHECK_EVERY_MS).unref();
}

// Publishes every scheduled message whose time has come
export async function runDueScheduled() {
  if (running || !isDatabaseConnected()) return;
  running = true;
  try {
    while (true) {
      // Claimed atomically, so a message is never sent twice
      const scheduled = await ScheduledMessage.findOneAndUpdate(
        { status: 'pending', sendAt: { $lte: new Date() } },
        { status: 'sending' },
        { sort: { sendAt: 1 }, returnDocument: 'after' }
      );
      if (!scheduled) break;
      await sendScheduled(scheduled);
    }
  } catch (err) {
    console.error('[scheduler]', err);
  } finally {
    running = false;
  }
}

async function sendScheduled(scheduled) {
  for (const item of scheduled.items) {
    if (item.status !== 'pending') continue;
    try {
      const error = await deliver(scheduled.senderId, item);
      item.status = error ? 'failed' : 'sent';
      item.error = error || '';
    } catch (err) {
      console.error('[scheduler]', err);
      item.status = 'failed';
      item.error = 'Something went wrong while sending.';
    }
    await scheduled.save(); // after each copy, so a crash never sends one twice
  }

  scheduled.status = 'done';
  scheduled.sentAt = new Date();
  await scheduled.save();
  // The sender's "Scheduled" list updates if it's open
  getIO()?.to(userRoom(scheduled.senderId)).emit('scheduled:updated', { id: String(scheduled._id) });
}

// Sends one copy. Returns why it couldn't be sent, or null.
async function deliver(senderId, item) {
  const sender = String(senderId);
  const conversation = await Conversation.findOne({ _id: item.conversationId, participants: sender });
  if (!conversation) return 'This chat no longer exists.';

  const blocked = blockError(conversation, sender);
  if (blocked) return blocked;

  if (conversation.pausedBy?.by) {
    if (String(conversation.pausedBy.by) !== sender) return "They're taking some space right now.";
    await resumeConversation(conversation, sender); // I stepped away; writing again means I'm back
  }

  // Being ghosted (anything but soft) only allows emojis, which the server can't
  // check inside an encrypted message, so it isn't sent
  const ghostedByThem = conversation.ghost?.by && String(conversation.ghost.by) !== sender;
  if (ghostedByThem && ghostLevel(conversation.ghost) !== 'soft') return "They're ghosting you right now.";

  // Their keys may have changed since it was scheduled; then they couldn't read it
  const checked = await checkEncrypted(conversation, item, sender);
  if (checked.error) {
    return checked.code === 'KEYS_CHANGED' || checked.code === 'NO_KEYS'
      ? 'Their encryption keys changed since you scheduled it, so it could not be sent.'
      : checked.error;
  }

  const recipients = conversation.participants.filter((p) => String(p) !== sender);
  const message = await publishMessage(conversation, {
    senderId: sender,
    recipients,
    messageType: 'text',
    ciphertext: item.ciphertext,
    iv: item.iv,
    senderKey: item.senderKey,
    keys: checked.keys,
    deliveredTo: recipients.filter((id) => isUserOnline(id)),
  });
  item.messageId = message._id;
  return null;
}
