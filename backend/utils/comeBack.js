import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { comeBackMail, mailerReady, sendMail } from './mailer.js';
import { isUserOnline } from '../socket/io.js';

// 💌 "People are waiting for you": one email to someone who hasn't opened the
// app for two days or more, saying who wrote to them while they were away.
//
// - One mail per absence. After it's sent, nothing more goes out until they've
//   been back and gone quiet for two days again.
// - It says who and how many, never what: messages are end-to-end encrypted, so
//   the server couldn't quote one if it wanted to.
// - Chats they muted, deleted, blocked or are ghosting don't count as "waiting".
// - Every mail has a link that stops them for good (routes/mail.js).
// - Only a few go out per hour (COME_BACK_MAILS_PER_HOUR, default 8), so the
//   mail service's daily allowance is left for verification codes.
// - Nothing is sent unless a mail service is set up (BREVO_API_KEY + MAIL_FROM)
//   and the first CLIENT_URL is a real address, since the links point there.

const AWAY_MS = 2 * 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 2 * 60 * 1000;
const NAMES_SHOWN = 3;

function perRun() {
  const set = parseInt(process.env.COME_BACK_MAILS_PER_HOUR || '', 10);
  return Number.isFinite(set) && set >= 0 ? set : 8;
}

// Where the app lives, for the links in the mail
function appUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/+$/, '');
}

// The link that stops these mails. Deliberately not a { userId } token: that's
// what the login cookie is, and a link in an inbox must never work as one.
export function mailOffToken(userId) {
  return jwt.sign({ mailOff: String(userId) }, process.env.JWT_SECRET);
}

export function readMailOffToken(token) {
  try {
    return jwt.verify(String(token || ''), process.env.JWT_SECRET).mailOff || null;
  } catch {
    return null;
  }
}

// Who wrote to them and hasn't been read: { count, names } with the people who
// wrote most first
async function whoIsWaiting(userId) {
  const me = new mongoose.Types.ObjectId(String(userId));
  const chats = await Conversation.find({
    participants: me,
    mutedBy: { $ne: me },
    hiddenFor: { $ne: me },
    blockedBy: { $ne: me },
    'ghost.by': { $ne: me },
    'pausedBy.by': { $ne: me },
  }).distinct('_id');
  if (!chats.length) return { count: 0, names: [] };

  const senders = await Message.aggregate([
    {
      $match: {
        recipients: me,
        isRead: false,
        readBy: { $ne: me },
        conversationId: { $in: chats },
        messageType: { $ne: 'event' },
        isDeleted: false,
        disappeared: { $ne: true },
        deletedFor: { $ne: me },
      },
    },
    { $group: { _id: '$senderId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  if (!senders.length) return { count: 0, names: [] };

  const people = await User.find({ _id: { $in: senders.map((s) => s._id) } }).select('name').lean();
  const nameOf = new Map(people.map((p) => [String(p._id), p.name]));
  return {
    count: senders.reduce((total, s) => total + s.count, 0),
    names: senders.map((s) => nameOf.get(String(s._id))).filter(Boolean),
  };
}

// Sends this hour's share. Each person is claimed with one atomic update before
// their mail goes out, so a second server (or a second run) can't mail them too.
export async function sendComeBackMails(limit = perRun()) {
  let sent = 0;
  for (let i = 0; i < limit; i++) {
    const user = await User.findOneAndUpdate(
      {
        emailVerified: true,
        comeBackMails: { $ne: false },
        lastSeen: { $lte: new Date(Date.now() - AWAY_MS) },
        // Not yet mailed about this absence
        $or: [{ comeBackMailAt: null }, { $expr: { $lt: ['$comeBackMailAt', '$lastSeen'] } }],
      },
      { comeBackMailAt: new Date() },
      // Whoever left most recently first: they're the likeliest to come back
      { sort: { lastSeen: -1 } }
    ).select('name email');
    if (!user) break;
    // lastSeen is only written when someone leaves, so a person who has had
    // the app open for days looks "away". They're here; no mail.
    if (isUserOnline(user._id)) continue;

    try {
      const waiting = await whoIsWaiting(user._id);
      const mail = comeBackMail({
        name: user.name.split(' ')[0],
        ...waiting,
        namesShown: NAMES_SHOWN,
        openUrl: `${appUrl()}/chat`,
        stopUrl: `${appUrl()}/api/mail/off?t=${mailOffToken(user._id)}`,
      });
      await sendMail({ to: user.email, ...mail });
      sent += 1;
    } catch (err) {
      // They stay claimed: a mailbox that refuses mail isn't retried every hour
      console.error('[come-back]', err.message);
    }
  }
  return sent;
}

export function startComeBackMails() {
  if (!mailerReady() || perRun() === 0) return;
  // A server on someone's own machine would mail real people links to
  // "localhost" — which open nothing for them
  if (/\/\/(localhost|127\.0\.0\.1)(:|$)/.test(appUrl())) {
    console.warn('> Come-back emails are off: the first CLIENT_URL is a local address.');
    return;
  }
  const run = () => sendComeBackMails().catch((err) => console.error('[come-back]', err));
  setTimeout(run, FIRST_CHECK_MS).unref();
  setInterval(run, CHECK_EVERY_MS).unref();
}
