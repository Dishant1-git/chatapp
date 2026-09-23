import mongoose from 'mongoose';
import Message from '../models/Message.js';

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

// The streaks of many chats in one query, for the conversation list.
// Returns a Map of conversation id → streak in days.
export async function streaksFor(conversationIds, offsetMin) {
  if (!conversationIds.length) return new Map();

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
