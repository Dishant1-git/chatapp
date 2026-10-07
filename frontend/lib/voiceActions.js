// 🎙️ What the voice assistant can do. The server turns a spoken sentence into
// { action, name, text, when, option } (backend/utils/assistant.js); perform()
// here carries it out with the same calls the screens make.
//
// perform() answers with one of:
//   { say }                               done (or couldn't): say this
//   { confirm: { question, yes, run } }   ask first; run() does it and returns what to say
//   { call: { conversation, video } }     ring them, after a moment to call it off
//
// Anything that reaches other people and can't simply be taken back — a
// message, a gift, a scheduled one, an edit, a deletion, a ghosting, a group
// made or changed, a new name or nickname, a chat cleared — is asked about
// first: a misheard name or sentence is one word away. The small things (a
// buzz, a "miss you", a reaction, a sticker) and everything that only changes
// my own screen happen straight away.
//
// A command said without a name is about the chat that's open.
import { api } from './client';
import { setBoo, BOO_ID } from './boo';
import { conversationTitle, isGroup, makeNameOf } from './conversations';
import { encryptMessage, openMessages } from './e2ee';
import { canForwardTo } from './forward';
import { formatLastSeen, messagePreview } from './format';
import { GHOST_LEVEL_INFO } from './ghost';
import { MOODS as GIFT_MOODS } from './gifts';
import { setPrivacy } from './privacy';
import { MOODS } from './social';
import { STICKER_PACKS } from './stickers';
import { askChat, findChat, sendTextTo, sendTo, setVoice } from './voice';

const MAX_READ_ALOUD = 5;
// Keep in sync with EDIT_WINDOW_MS in components/Message.jsx
const EDIT_WINDOW_MS = 2 * 60 * 1000;
const PANELS = { profile: 'profile', calls: 'calls', scheduled: 'scheduled', group: 'newGroup', search: 'newChat' };
const PANEL_NAMES = { profile: 'your profile', calls: 'your calls', scheduled: 'your scheduled messages', group: 'a new group', search: 'a new chat' };

// What the server calls them (backend/utils/assistant.js) → what the app uses
const REACTION_EMOJI = { heart: '❤️', laugh: '😂', like: '👍', wow: '😮', sad: '😢', pray: '🙏' };
const MOOD_KEYS = { barely: 'barely', overthinking: 'overthinking', donttext: 'dontText', yap: 'yap', social: 'social', disappearing: 'disappearing', none: '' };
const STICKERS = STICKER_PACKS.flatMap((pack) => pack.stickers);

const quote = (text) => `“${text}”`;
// "Ann", "Ann and Bob", "Ann, Bob and Cat"
const list = (names) => (names.length < 2 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
// A voice reads "📷 Photo" better as "Photo"
const speakable = (text) => String(text || '').replace(/^[\p{Extended_Pictographic}️\s]+/u, '');

// The chat a command is about: the one named, or the one that's open.
// → { conversation, who } or { say } explaining why there isn't one.
function chatFor(name, ctx, { directOnly = false, mustReach = false } = {}) {
  let conversation;
  if (name) {
    const found = findChat(ctx.conversations, name);
    if (found.several) return { say: `I found ${list(found.several)}. Say it again with the full name.` };
    if (!found.conversation) return { say: `I couldn’t find ${quote(name)} in your chats.` };
    conversation = found.conversation;
  } else {
    conversation = ctx.conversations.find((c) => c._id === ctx.activeId);
    if (!conversation) return { say: 'Who? Say the name too.' };
  }
  const who = conversationTitle(conversation);
  if (directOnly && isGroup(conversation)) return { say: `${who} is a group. That only works with one person.` };
  if (mustReach && !canForwardTo(conversation, ctx.myId)) return { say: `You can’t reach ${who} right now.` };
  return { conversation, who };
}

// The people meant by "Harinder, Simran and Aman": each is looked up among my
// one-to-one chats. → { people: [{ id, name }] } or { say }
function peopleFor(spoken, ctx) {
  const direct = ctx.conversations.filter((c) => !isGroup(c) && c.otherUser);
  const people = [];
  for (const name of String(spoken).split(/\s*(?:,|&|\band\b|\baur\b)\s*/i).filter(Boolean)) {
    const found = findChat(direct, name);
    if (found.several) return { say: `I found ${list(found.several)}. Say it again with the full name.` };
    if (!found.conversation) return { say: `I couldn’t find ${quote(name)} in your chats.` };
    const person = found.conversation.otherUser;
    if (!people.some((p) => p.id === person._id)) people.push({ id: person._id, name: person.name });
  }
  return people.length ? { people } : { say: 'Who? Say the name too.' };
}

// The group a command is about (named, or the one that's open) → { conversation, who } or { say }
function groupFor(name, ctx) {
  const chat = chatFor(name, ctx);
  if (chat.say) return chat;
  return isGroup(chat.conversation) ? chat : { say: `${chat.who} isn’t a group.` };
}

// The sticker meant by "hug", "party", "crying": its label or its id says so
function stickerFor(words) {
  const wanted = String(words).toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!wanted) return null;
  const says = (sticker) => `${sticker.label} ${sticker.id.replace(/-/g, ' ')}`.toLowerCase();
  return (
    STICKERS.find((s) => s.label.toLowerCase() === wanted) ||
    STICKERS.find((s) => says(s).includes(wanted)) ||
    // "crying" → "cry", "hugs" → "hug"
    STICKERS.find((s) => wanted.split(' ').some((word) => word.length > 2 && says(s).split(' ').some((w) => w.length > 2 && (word.startsWith(w) || w.startsWith(word)))))
  );
}

async function saveProfile(fields, ctx) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
  const { user } = await api('/api/users/me', { method: 'PATCH', formData });
  ctx.setUser(user);
}

// The newest page of a chat, decrypted
async function recentMessages(conversation) {
  const { messages } = await api(`/api/conversations/${conversation._id}/messages`);
  return openMessages(messages, conversation._id);
}

async function myLastMessage(conversation, myId) {
  const messages = await recentMessages(conversation);
  return messages.findLast((m) => m.senderId === myId && m.messageType !== 'event' && !m.isDeleted && !m.disappeared);
}

// Runs send(members) with the chat's members, once more with fresh ones if
// someone's keys changed since the list was loaded
async function withMembers(conversation, send) {
  try {
    return await send(conversation.participants || []);
  } catch (err) {
    if (err.code !== 'KEYS_CHANGED') throw err;
    const { conversation: fresh } = await api(`/api/conversations/${conversation._id}`);
    return send(fresh.participants);
  }
}

// "today at 5:00 PM", "tomorrow at 9:00 AM", "Friday 10 October at 9:00 AM"
function sayWhen(iso) {
  const at = new Date(iso);
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : at.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return `${day} at ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// Who has written, across every chat
function whoWrote(ctx) {
  const waiting = ctx.conversations.filter((c) => c.unreadCount > 0 && !c.isMuted && !c.isRequest);
  const requests = ctx.conversations.filter((c) => c.isRequest).length;
  const parts = waiting.map((c) => `${c.unreadCount} from ${conversationTitle(c)}`);
  if (requests) parts.push(`${requests} message ${requests === 1 ? 'request' : 'requests'}`);
  return { waiting, say: parts.length ? `You have ${list(parts)}.` : 'No new messages.' };
}

// Reads the new messages of one chat out loud (or its last one, if nothing is new)
async function readChat(conversation, who, ctx) {
  const nameOf = makeNameOf(conversation, ctx.myId);
  const theirs = (await recentMessages(conversation)).filter(
    (m) => m.senderId !== ctx.myId && m.messageType !== 'event' && !m.isDeleted
  );
  if (!theirs.length) return { say: `Nothing from ${who} yet.` };

  const unread = Math.min(conversation.unreadCount || 0, MAX_READ_ALOUD, theirs.length);
  const lines = theirs
    .slice(-(unread || 1))
    .map((m) => `${isGroup(conversation) ? `${nameOf(m.senderId)}: ` : ''}${speakable(messagePreview(m, { nameOf, myId: ctx.myId }))}`);
  // Hearing them is reading them — not for a request I haven't answered, though
  if (conversation.unreadCount > 0 && !conversation.isRequest) ctx.markAsRead(conversation._id);
  return { say: `${unread ? `${who} wrote` : `The last message from ${who}`}: ${lines.join('. ')}` };
}

const ACTIONS = {
  call: (r, ctx) => startCall(r, ctx, false),
  video_call: (r, ctx) => startCall(r, ctx, true),

  message(r, ctx) {
    const chat = chatFor(r.name, ctx, { mustReach: true });
    if (chat.say) return chat;
    return {
      confirm: {
        question: `To ${chat.who}: ${quote(r.text)}`,
        yes: 'Send',
        run: async () => (await sendTextTo(chat.conversation, r.text), 'Sent.'),
      },
    };
  },

  schedule(r, ctx) {
    const chat = chatFor(r.name, ctx, { directOnly: true, mustReach: true });
    if (chat.say) return chat;
    const { conversation } = chat;
    return {
      confirm: {
        question: `For ${chat.who}, ${sayWhen(r.when)}: ${quote(r.text)}`,
        yes: 'Schedule',
        async run() {
          await withMembers(conversation, async (members) => {
            const { encrypted } = await encryptMessage({ conversationId: conversation._id, members, payload: { text: r.text } });
            return api('/api/scheduled', {
              method: 'POST',
              body: { sendAt: r.when, items: [{ conversationId: conversation._id, ...encrypted }] },
            });
          });
          return 'Scheduled.';
        },
      },
    };
  },

  open(r, ctx) {
    const chat = chatFor(r.name, ctx);
    if (chat.say) return chat;
    ctx.router.push(`/chat/${chat.conversation._id}`);
    return { say: `Opening ${chat.who}.` };
  },

  async read(r, ctx) {
    if (r.name || ctx.conversations.some((c) => c._id === ctx.activeId)) {
      const chat = chatFor(r.name, ctx);
      return chat.say ? chat : readChat(chat.conversation, chat.who, ctx);
    }
    // Nobody named and no chat open: whoever wrote — read out if it's just one of them
    const { waiting, say } = whoWrote(ctx);
    return waiting.length === 1 ? readChat(waiting[0], conversationTitle(waiting[0]), ctx) : { say };
  },

  unread: (r, ctx) => ({ say: whoWrote(ctx).say }),

  async delete_last(r, ctx) {
    const chat = chatFor(r.name, ctx);
    if (chat.say) return chat;
    const message = await myLastMessage(chat.conversation, ctx.myId);
    if (!message) return { say: `You haven’t sent ${chat.who} anything lately.` };
    return {
      confirm: {
        question: `Delete your last message to ${chat.who}, ${quote(speakable(messagePreview(message, { myId: ctx.myId })))}, for everyone?`,
        yes: 'Delete',
        run: async () => (await api(`/api/messages/${message._id}?for=everyone`, { method: 'DELETE' }), 'Deleted.'),
      },
    };
  },

  async edit_last(r, ctx) {
    const chat = chatFor(r.name, ctx, { mustReach: true });
    if (chat.say) return chat;
    const { conversation } = chat;
    const message = await myLastMessage(conversation, ctx.myId);
    if (!message) return { say: `You haven’t sent ${chat.who} anything lately.` };
    // The same rules as the Edit option on a message (canEdit in Message.jsx)
    const isPlainText =
      message.messageType === 'text' && message.ciphertext && message.text && !message.sticker && !message.forgiveness && !message.gift && !message.boo;
    if (!isPlainText) return { say: 'Your last message there isn’t a text, so it can’t be edited.' };
    if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
      return { say: 'Your last message there is more than two minutes old, so it can’t be edited any more.' };
    }
    return {
      confirm: {
        question: `Change ${quote(message.text)} to ${quote(r.text)}?`,
        yes: 'Change',
        async run() {
          await withMembers(conversation, async (members) => {
            const { encrypted } = await encryptMessage({ conversationId: conversation._id, members, payload: { text: r.text } });
            return api(`/api/messages/${message._id}`, { method: 'PATCH', body: encrypted });
          });
          return 'Changed.';
        },
      },
    };
  },

  buzz: (r, ctx) => nudge(r, ctx, 'buzz', (who) => `Buzzed ${who}.`),
  miss_you: (r, ctx) => nudge(r, ctx, 'miss-you', (who) => `Told ${who} you miss them.`),

  async find(r, ctx) {
    const { users } = await api(`/api/users/search?q=${encodeURIComponent(r.name)}`);
    if (!users.length) return { say: `I couldn’t find anyone called ${quote(r.name)} on Ghost-ed.` };
    if (users.length > 1) {
      // Two people can share a name; their handles tell them apart
      const names = users.slice(0, 3).map((u) => u.name);
      const shown = users.slice(0, 3).map((u) => (names.filter((n) => n === u.name).length > 1 && u.username ? `${u.name} (@${u.username})` : u.name));
      return { say: `I found ${list(shown)}${users.length > 3 ? ' and more' : ''}. Say it again with the full name.` };
    }
    await ctx.openChatWith(users[0]._id);
    return { say: `Found ${users[0].name}. Their chat is open.` };
  },

  mute: (r, ctx) => setMuted(r, ctx, true),
  unmute: (r, ctx) => setMuted(r, ctx, false),

  ghost(r, ctx) {
    const chat = chatFor(r.name, ctx, { directOnly: true });
    if (chat.say) return chat;
    const level = GHOST_LEVEL_INFO[r.option] ? r.option : 'ghosted';
    return {
      confirm: {
        question: `Ghost ${chat.who}? ${GHOST_LEVEL_INFO[level].label}: ${GHOST_LEVEL_INFO[level].hint}`,
        yes: 'Ghost',
        async run() {
          await api(`/api/conversations/${chat.conversation._id}/ghost`, { method: 'POST', body: { level } });
          return `${chat.who} is ghosted.`;
        },
      },
    };
  },

  async unghost(r, ctx) {
    const chat = chatFor(r.name, ctx, { directOnly: true });
    if (chat.say) return chat;
    await api(`/api/conversations/${chat.conversation._id}/ghost`, { method: 'DELETE' });
    return { say: `${chat.who} is unghosted.` };
  },

  online(r, ctx) {
    if (r.name) {
      const chat = chatFor(r.name, ctx, { directOnly: true });
      if (chat.say) return chat;
      const person = chat.conversation.otherUser;
      if (person?.isOnline) return { say: `${chat.who} is online.` };
      // Not shared before a request is accepted, so there may be nothing to say
      return { say: person?.lastSeen ? `${chat.who} was ${formatLastSeen(person.lastSeen)}.` : `${chat.who} isn’t online.` };
    }
    const here = ctx.conversations.filter((c) => !isGroup(c) && c.otherUser?.isOnline).map(conversationTitle);
    return { say: here.length ? `${list(here)} ${here.length > 1 ? 'are' : 'is'} online.` : 'Nobody’s online right now.' };
  },

  show(r, ctx) {
    // On a phone the list (and its panels) is behind the open chat
    if (ctx.activeId) ctx.router.push('/chat');
    ctx.setSidebarPanel(PANELS[r.option]);
    return { say: `Opening ${PANEL_NAMES[r.option]}.` };
  },

  boo(r) {
    setBoo(r.option === 'on'); // Boo makes its own entrance, or exit
    return { say: '' };
  },

  privacy(r) {
    setPrivacy(r.option === 'on');
    return { say: `Privacy screen ${r.option}.` };
  },

  stop() {
    setVoice(false);
    return { say: '' };
  },

  // ---- Groups ----

  group_create(r, ctx) {
    const members = peopleFor(r.extra, ctx);
    if (members.say) return members;
    return {
      confirm: {
        question: `Create the group ${quote(r.name)} with ${list(members.people.map((p) => p.name))}?`,
        yes: 'Create',
        // Opens the new group, like the "New group" screen does
        run: async () => (await ctx.createGroup({ name: r.name, memberIds: members.people.map((p) => p.id) }), 'Created.'),
      },
    };
  },

  group_add(r, ctx) {
    const group = groupFor(r.name, ctx);
    if (group.say) return group;
    const members = peopleFor(r.extra, ctx);
    if (members.say) return members;
    const names = list(members.people.map((p) => p.name));
    return {
      confirm: {
        question: `Add ${names} to ${group.who}?`,
        yes: 'Add',
        async run() {
          await api(`/api/conversations/${group.conversation._id}/members`, { method: 'POST', body: { userIds: members.people.map((p) => p.id) } });
          return `Added ${names}.`;
        },
      },
    };
  },

  group_remove(r, ctx) {
    const group = groupFor(r.name, ctx);
    if (group.say) return group;
    const members = peopleFor(r.extra, ctx);
    if (members.say) return members;
    const names = list(members.people.map((p) => p.name));
    return {
      confirm: {
        question: `Remove ${names} from ${group.who}?`,
        yes: 'Remove',
        async run() {
          for (const person of members.people) {
            await api(`/api/conversations/${group.conversation._id}/members/${person.id}`, { method: 'DELETE' });
          }
          return `Removed ${names}.`;
        },
      },
    };
  },

  group_leave(r, ctx) {
    const group = groupFor(r.name, ctx);
    if (group.say) return group;
    return {
      confirm: {
        question: `Leave ${group.who}?`,
        yes: 'Leave',
        async run() {
          await api(`/api/conversations/${group.conversation._id}/members/${ctx.myId}`, { method: 'DELETE' });
          leaveScreen(group.conversation, ctx);
          return `You left ${group.who}.`;
        },
      },
    };
  },

  // ---- A person, a chat, me ----

  nickname(r, ctx) {
    const chat = chatFor(r.name, ctx, { directOnly: true });
    if (chat.say) return chat;
    const save = async () => {
      await api(`/api/conversations/${chat.conversation._id}/nickname`, { method: 'PUT', body: { nickname: r.text } });
      return r.text ? `${chat.who} is now ${quote(r.text)}.` : 'Nickname removed.';
    };
    // They're told about a new nickname, so that one is asked about
    if (!r.text) return save().then((say) => ({ say }));
    return { confirm: { question: `Call ${chat.who} ${quote(r.text)}? They’ll see it.`, yes: 'Yes', run: save } };
  },

  profile_name: (r, ctx) => ({
    confirm: {
      question: `Change your name to ${quote(r.text)}? Everyone you chat with will see it.`,
      yes: 'Change',
      run: async () => (await saveProfile({ name: r.text }, ctx), `You’re ${r.text} now.`),
    },
  }),

  async mood(r, ctx) {
    const mood = MOOD_KEYS[r.option];
    await saveProfile({ mood }, ctx);
    return { say: mood ? `Your mood is ${MOODS[mood].label}.` : 'Mood cleared.' };
  },

  clear_chat(r, ctx) {
    const chat = chatFor(r.name, ctx);
    if (chat.say) return chat;
    return {
      confirm: {
        question: `Clear every message with ${chat.who} from your side? They keep theirs.`,
        yes: 'Clear',
        run: async () => (await api(`/api/conversations/${chat.conversation._id}/clear`, { method: 'POST' }), 'Cleared.'),
      },
    };
  },

  delete_chat(r, ctx) {
    const chat = chatFor(r.name, ctx);
    if (chat.say) return chat;
    return {
      confirm: {
        question: `Delete the chat with ${chat.who}? It comes back if a new message arrives.`,
        yes: 'Delete',
        async run() {
          await api(`/api/conversations/${chat.conversation._id}`, { method: 'DELETE' });
          leaveScreen(chat.conversation, ctx);
          return 'Deleted.';
        },
      },
    };
  },

  // ---- Small things sent straight away ----

  async react(r, ctx) {
    const chat = chatFor(r.name, ctx);
    if (chat.say) return chat;
    const message = (await recentMessages(chat.conversation)).findLast(
      (m) => m.senderId !== ctx.myId && m.messageType !== 'event' && !m.isDeleted && !m.disappeared
    );
    if (!message) return { say: `Nothing from ${chat.who} to react to.` };
    await api(`/api/messages/${message._id}/reaction`, { method: 'POST', body: { emoji: REACTION_EMOJI[r.option] } });
    return { say: `Reacted ${REACTION_EMOJI[r.option]} to ${chat.who}’s last message.` };
  },

  async sticker(r, ctx) {
    const chat = chatFor(r.name, ctx, { mustReach: true });
    if (chat.say) return chat;
    const sticker = stickerFor(r.text);
    if (!sticker) return { say: `I don’t have a ${quote(r.text)} sticker. Try hug, kiss, party, laughing or crying.` };
    await sendTo(chat.conversation, { text: '', sticker: sticker.id });
    return { say: `Sent ${chat.who} the ${quote(sticker.label)} sticker.` };
  },

  gift(r, ctx) {
    const chat = chatFor(r.name, ctx, { mustReach: true });
    if (chat.say) return chat;
    const mood = GIFT_MOODS[r.option] ? r.option : 'love';
    return {
      confirm: {
        question: `A ${GIFT_MOODS[mood].label.toLowerCase()} gift for ${chat.who}: ${quote(r.text)}`,
        yes: 'Send gift',
        async run() {
          await sendTo(chat.conversation, { text: r.text, gift: { mood, style: GIFT_MOODS[mood].style, together: false } });
          return 'Gift sent.';
        },
      },
    };
  },

  // ---- Things only the chat's own screen can do: it's opened and asked ----

  camera: (r, ctx) => askScreen(r, ctx, 'camera', (who) => `The camera’s open for ${who}.`),
  voice_note: (r, ctx) => askScreen(r, ctx, 'recorder', (who) => `Recording for ${who}. Tap send when you’re done.`),
};

// A photo or a voice note can't be made by talking: the chat is opened with
// its camera, or its recorder, already running (useChatAsk in lib/voice.js)
function askScreen(r, ctx, what, done) {
  const chat = chatFor(r.name, ctx, { mustReach: true });
  if (chat.say) return chat;
  askChat(chat.conversation._id, what);
  if (ctx.activeId !== chat.conversation._id) ctx.router.push(`/chat/${chat.conversation._id}`);
  return { say: done(chat.who) };
}

// A chat I'm no longer in (or deleted) leaves the list, and the screen if it was open
function leaveScreen(conversation, ctx) {
  ctx.removeConversation(conversation._id);
  if (ctx.activeId === conversation._id) ctx.router.push('/chat');
}

function startCall(r, ctx, video) {
  const chat = chatFor(r.name, ctx, { mustReach: true });
  return chat.say ? chat : { call: { conversation: chat.conversation, who: chat.who, video } };
}

// 📳 A buzz or 💕 a "miss you". Why it can't be sent (a cooldown, being
// ghosted) comes back from the server as a sentence, and is said as it is.
async function nudge(r, ctx, kind, done) {
  const chat = chatFor(r.name, ctx, { directOnly: true });
  if (chat.say) return chat;
  await api(`/api/conversations/${chat.conversation._id}/${kind}`, { method: 'POST' });
  return { say: done(chat.who) };
}

async function setMuted(r, ctx, muted) {
  const chat = chatFor(r.name, ctx);
  if (chat.say) return chat;
  const { isMuted } = await api(`/api/conversations/${chat.conversation._id}/mute`, { method: 'POST', body: { muted } });
  ctx.updateConversation(chat.conversation._id, { isMuted });
  return { say: `${chat.who} is ${isMuted ? 'muted' : 'unmuted'}.` };
}

// result: what the server understood. ctx: everything ChatProvider offers
// (conversations, setSidebarPanel, updateConversation, markAsRead, openChatWith,
// createGroup, removeConversation, setUser …) plus { myId, activeId, router }
export async function perform(result, ctx) {
  const act = ACTIONS[result?.action];
  if (!act) return { say: result?.say || '' };
  // Boo's own chat isn't a conversation: nothing here is about it
  return act(result, { ...ctx, activeId: ctx.activeId === BOO_ID ? null : ctx.activeId });
}
