import mongoose from 'mongoose';
import Message from '../models/Message.js';
import { getMany, setMany } from './cache.js';

// 🔥 Connection streaks: consecutive days where a chat really was a chat.
// Used by the conversation list and by "read the vibe".

// "+05:30" → 330 (minutes east of UTC)
export function parseOffset(tz) {
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(String(tz || ''));
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return Math.min(14 * 60, minutes) * (match[1] === '-' ? -1 : 1);
}

export function localDay(date, offsetMin) {
  return new Date(date.getTime() + offsetMin * 60000).toISOString().slice(0, 10);
}

// Consecutive "meaningful" days ending today (or yesterday, since today isn't over yet).
// A day counts when both people talked and there were 5+ messages, or there was a call or a "miss you".
export function connectionStreak(days, offsetMin) {
  const qualifies = (day) => {
    const d = days.get(day);
    return Boolean(d && ((d.senders.size >= 2 && d.count >= 5) || d.special));
  };
  const cursor = new Date();
  if (!qualifies(localDay(cursor, offsetMin))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (qualifies(localDay(cursor, offsetMin))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// How far back streaks are counted. Older days don't change today's number.
const STREAK_WINDOW_DAYS = 400;

const STREAK_CACHE_SECONDS = 30 * 60;

// A chat's streak can only change when a message arrives or the day turns over,
// so both are part of its cache key: a new message (lastMessageAt moves) or
// midnight simply asks under a new key, and nothing ever has to be cleared.
// What the key can't see is a message being deleted, which is why it also
// expires after half an hour.
function streakKey(conversation, offsetMin) {
  const day = localDay(new Date(), offsetMin);
  return `streak:${conversation._id}:${offsetMin}:${day}:${new Date(conversation.lastMessageAt || 0).getTime()}`;
}

// The streaks of many chats, for the conversation list (which asks every time
// the app opens). conversations: [{ _id, lastMessageAt }].
// Returns a Map of conversation id → streak in days. Only the chats whose
// streak isn't cached are counted, all of them in one query.
export async function streaksFor(conversations, offsetMin) {
  const streaks = new Map();
  if (!conversations.length) return streaks;

  const keys = conversations.map((c) => streakKey(c, offsetMin));
  const known = await getMany(keys);
  const unknown = [];
  conversations.forEach((c, i) => {
    if (known[i] === undefined) unknown.push({ id: String(c._id), key: keys[i] });
    else streaks.set(String(c._id), known[i]);
  });
  if (!unknown.length) return streaks;

  const counted = await countStreaks(unknown.map((c) => c.id), offsetMin);
  unknown.forEach((c) => streaks.set(c.id, counted.get(c.id) || 0));
  await setMany(unknown.map((c) => [c.key, streaks.get(c.id)]), STREAK_CACHE_SECONDS);
  return streaks;
}

async function countStreaks(conversationIds, offsetMin) {

  const rows = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
        isDeleted: false,
        createdAt: { $gte: new Date(Date.now() - STREAK_WINDOW_DAYS * 24 * 3600 * 1000) },
      },
    },
    {
      // One row per chat per local day, with the same counts connectionStreak() expects
      $group: {
        _id: {
          conversationId: '$conversationId',
          day: { $dateToString: { format: '%Y-%m-%d', date: { $add: ['$createdAt', offsetMin * 60000] } } },
        },
        count: { $sum: { $cond: [{ $eq: ['$messageType', 'event'] }, 0, 1] } },
        senders: { $addToSet: { $cond: [{ $eq: ['$messageType', 'event'] }, null, '$senderId'] } },
        special: {
          $max: {
            $cond: [
              {
                $or: [
                  { $and: [{ $eq: ['$event.type', 'call'] }, { $gt: ['$event.duration', 0] }] },
                  { $eq: ['$event.type', 'missYou'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const daysByConversation = new Map();
  for (const row of rows) {
    const id = String(row._id.conversationId);
    if (!daysByConversation.has(id)) daysByConversation.set(id, new Map());
    daysByConversation.get(id).set(row._id.day, {
      count: row.count,
      senders: new Set(row.senders.filter(Boolean).map(String)),
      special: Boolean(row.special),
    });
  }

  const streaks = new Map();
  for (const [id, days] of daysByConversation) streaks.set(id, connectionStreak(days, offsetMin));
  return streaks;
}
