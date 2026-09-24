'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { checkImageFile } from './ImagePreview';
import { api } from '@/lib/client';
import { prepareImage } from '@/lib/e2ee';
import { backgroundStyle } from '@/lib/chatBackground';
import { GHOST_LEVEL_INFO } from '@/lib/ghost';
import { PAUSE_REASONS, formatShortDuration, timezoneOffset } from '@/lib/social';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// Centered on desktop, a bottom sheet on phones (like DeleteDialog)
function Modal({ title, onClose, children }) {
  useEscapeKey(onClose);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label={title}
        className="w-full max-w-sm rounded-t-3xl bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Option({ emoji, label, hint, selected, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition disabled:opacity-50 ${
        selected ? 'border-brand bg-brand-soft' : 'border-line hover:bg-hover'
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}

// 👻 Pick (or change) a ghost level, or unghost
export function GhostDialog({ conversation, myId, onClose, onError, onChanged }) {
  const [busy, setBusy] = useState(null);
  const { ghost, otherUser } = conversation;
  const current = ghost?.by === myId ? ghost.level : null;

  async function run(key, request) {
    setBusy(key);
    try {
      const data = await request();
      onChanged(data.ghost ?? null);
      onClose();
    } catch (err) {
      onError(err.message);
      setBusy(null);
    }
  }

  return (
    <Modal title={current ? `Ghosting ${otherUser?.name}` : `Ghost ${otherUser?.name}?`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Pick how quiet it gets. You can change this or unghost them any time.</p>
      <div className="space-y-2">
        {Object.entries(GHOST_LEVEL_INFO).map(([level, info]) => (
          <Option
            key={level}
            {...info}
            selected={current === level}
            disabled={Boolean(busy)}
            onClick={() =>
              run(level, () => api(`/api/conversations/${conversation._id}/ghost`, { method: 'POST', body: { level } }))
            }
          />
        ))}
      </div>
      {current && (
        <button
          onClick={() => run('unghost', () => api(`/api/conversations/${conversation._id}/ghost`, { method: 'DELETE' }))}
          disabled={Boolean(busy)}
          className="mt-4 w-full rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {busy === 'unghost' ? 'Unghosting…' : '🕊️ Unghost'}
        </button>
      )}
    </Modal>
  );
}

// 🚪 Exit without drama
export function LeaveDialog({ conversation, onClose, onError, onLeft }) {
  const [busy, setBusy] = useState(null);
  const name = conversation.otherUser?.name;

  async function leave(reason) {
    setBusy(reason);
    try {
      await api(`/api/conversations/${conversation._id}/pause`, { method: 'POST', body: { reason } });
      onLeft();
    } catch (err) {
      onError(err.message);
      setBusy(null);
    }
  }

  return (
    <Modal title="Leave conversation" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        The chat leaves your list and {name} can’t message or call you. They’ll just see a short note. Open the chat
        again whenever you’re ready to come back.
      </p>
      <div className="space-y-2">
        {Object.entries(PAUSE_REASONS).map(([reason, info]) => (
          <Option
            key={reason}
            emoji={info.emoji}
            label={info.label}
            hint={`They’ll see: “${name?.split(' ')[0]} ${info.note}”`}
            disabled={Boolean(busy)}
            onClick={() => leave(reason)}
          />
        ))}
      </div>
    </Modal>
  );
}

const BADGE_EMOJIS = ['😂', '🍕', '🐸', '✈️', '🔥', '💀', '🎉', '🙈', '☕', '🎮', '🌙', '🦆'];

// 🧩 A new inside-joke badge
export function BadgeDialog({ conversation, onClose, onError }) {
  const [emoji, setEmoji] = useState(BADGE_EMOJIS[0]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/conversations/${conversation._id}/badges`, { method: 'POST', body: { emoji, label: label.trim() } });
      onClose();
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New inside joke" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="mb-3 grid grid-cols-6 gap-1.5">
          {BADGE_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`flex h-10 items-center justify-center rounded-xl text-2xl ${emoji === e ? 'bg-brand-soft ring-2 ring-brand' : 'hover:bg-hover'}`}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={30}
          placeholder="e.g. The Airport Incident"
          className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
        />
        <p className="mt-1.5 text-xs text-muted">Shown at the top of this chat for both of you.</p>
        <button
          type="submit"
          disabled={busy || !label.trim()}
          className="mt-4 w-full rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? 'Adding…' : `Add ${emoji} ${label.trim() || 'badge'}`}
        </button>
      </form>
    </Modal>
  );
}

// 🖼️ A background picture for THIS chat, seen by everyone in it
export function BackgroundDialog({ conversation, onClose, onError }) {
  const current = conversation.background;
  const [preview, setPreview] = useState(current?.url || '');
  const [dim, setDim] = useState(current?.dim ?? 0.25);
  const [blob, setBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  // Free the preview of a picture that was picked but not saved
  useEffect(() => () => blob && preview && URL.revokeObjectURL(preview), [blob, preview]);

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return onError(problem);
    try {
      // Resized before uploading, so a huge photo doesn't take ages
      const prepared = await prepareImage(file, 1400);
      setBlob(prepared.blob);
      setPreview(URL.createObjectURL(prepared.blob));
    } catch {
      onError('This image could not be read.');
    }
  }

  async function save() {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('dim', String(dim));
      if (blob) formData.append('image', blob, 'background.webp');
      await api(`/api/conversations/${conversation._id}/background`, { method: 'PUT', formData });
      onClose();
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/conversations/${conversation._id}/background`, { method: 'DELETE' });
      onClose();
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Chat background" onClose={onClose}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="chat-bg flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-line bg-cover bg-center text-sm font-medium"
        style={preview ? backgroundStyle(preview, dim) : undefined}
      >
        <span className={`rounded-full px-3 py-1.5 ${preview ? 'bg-black/50 text-white' : 'bg-panel text-brand'}`}>
          <ImagePlus size={16} className="mr-1.5 inline" />
          {preview ? 'Choose another picture' : 'Choose a picture'}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="hidden" />

      {preview && (
        <label className="mt-3 block text-sm">
          Fade
          <input
            type="range"
            min="0"
            max="0.6"
            step="0.05"
            value={dim}
            onChange={(e) => setDim(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--brand)]"
            aria-label="Fade the background"
          />
        </label>
      )}

      <p className="mt-2 text-xs text-muted">
        Just for this chat, and {conversation.type === 'group' ? 'everyone in the group' : conversation.otherUser?.name || 'the other person'} sees it
        too. Unlike your messages, a background isn’t end-to-end encrypted.
      </p>

      <div className="mt-4 flex gap-2">
        {current && (
          <button
            onClick={remove}
            disabled={busy}
            className="flex-1 rounded-full border border-line py-2.5 font-medium hover:bg-hover disabled:opacity-50"
          >
            Remove
          </button>
        )}
        <button
          onClick={save}
          disabled={busy || (!blob && !current)}
          className="flex-1 rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

function Stat({ emoji, value, label }) {
  return (
    <div className="rounded-2xl bg-panel-soft px-3 py-2.5">
      <p className="text-lg font-semibold">
        {emoji} {value}
      </p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

// 🧠 Read the vibe: neutral stats + a playful label
export function VibePanel({ conversation, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/conversations/${conversation._id}/insights?tz=${encodeURIComponent(timezoneOffset())}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [conversation._id]);

  return (
    <Modal title="Read the vibe 🧠" onClose={onClose}>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!data && !error && (
        <div className="flex justify-center py-10 text-muted">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat emoji="💬" value={data.messages} label="messages" />
            <Stat emoji="😂" value={data.laughs} label="laughs" />
            <Stat emoji="❤️" value={data.reactions} label="reactions" />
            <Stat emoji="📷" value={data.photos} label="photos" />
            <Stat emoji="📞" value={data.calls} label={`calls (${data.callMinutes} min)`} />
            <Stat emoji="⏱️" value={formatShortDuration(data.avgReplySeconds)} label="average reply" />
          </div>
          {conversation.type !== 'group' && (
            <p className="mt-3 text-center text-sm">
              Connection streak: <span className="font-semibold">🔥 {data.streak} {data.streak === 1 ? 'day' : 'days'}</span>
            </p>
          )}
          <div className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-center">
            <p className="text-xs text-muted">Conversation vibe</p>
            <p className="text-lg font-semibold">{data.vibe}</p>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">Just for fun — based on counts, not on what you wrote.</p>
        </>
      )}
    </Modal>
  );
}

const NICKNAME_IDEAS = ['Cutie 🥰', 'Bestie 💫', 'Sunshine ☀️', 'Chotu 🐣', 'Drama Queen 👑', 'Panda 🐼'];
const MAX_NICKNAME = 30;

// 💖 Give the other person a nickname. They see it too, with a cute popup.
export function NicknameDialog({ conversation, onClose, onError }) {
  const otherUser = conversation.otherUser;
  const current = conversation.nicknames?.[otherUser?._id] || '';
  const [nickname, setNickname] = useState(current);
  const [busy, setBusy] = useState(false);
  const firstName = otherUser?.name?.split(' ')[0] || 'them';

  async function save(value) {
    setBusy(true);
    try {
      await api(`/api/conversations/${conversation._id}/nickname`, { method: 'PUT', body: { nickname: value.trim() } });
      onClose();
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`💖 Nickname for ${firstName}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        You’ll both see it, and {firstName} gets a little surprise telling them what you named them.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (nickname.trim() && nickname.trim() !== current) save(nickname);
        }}
      >
        <label htmlFor="nickname-input" className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
          Type any nickname you like
          <span className="text-xs font-normal text-muted">
            {nickname.length}/{MAX_NICKNAME}
          </span>
        </label>
        <input
          id="nickname-input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={MAX_NICKNAME}
          autoFocus
          placeholder={`Your nickname for ${firstName}…`}
          className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
        />
        <p className="mt-3 mb-1.5 text-xs text-muted">Need an idea? Tap one, then change it however you want:</p>
        <div className="flex flex-wrap gap-1.5">
          {NICKNAME_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setNickname(idea)}
              className="rounded-full border border-line px-2.5 py-1 text-xs hover:bg-hover"
            >
              {idea}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || !nickname.trim() || nickname.trim() === current}
          className="mt-4 w-full rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save nickname'}
        </button>
      </form>
      {current && (
        <button
          onClick={() => save('')}
          disabled={busy}
          className="mt-2 w-full rounded-full py-2 text-sm text-muted hover:bg-hover disabled:opacity-60"
        >
          Remove nickname
        </button>
      )}
    </Modal>
  );
}

// A yes/no question before something that can't be undone (block, clear chat, delete chat)
export function ConfirmDialog({ title, text, confirmLabel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    // onConfirm reports its own errors; the dialog closes either way
    await onConfirm();
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">{text}</p>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-full border border-line py-2.5 font-medium hover:bg-hover">
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />} {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ✏️ Edit one of my text messages
export function EditMessageDialog({ message, onSave, onClose }) {
  const [text, setText] = useState(message.text);
  const [busy, setBusy] = useState(false);
  const trimmed = text.trim();

  async function save(event) {
    event.preventDefault();
    if (!trimmed || trimmed === message.text) return;
    setBusy(true);
    if (await onSave(message, trimmed)) onClose();
    else setBusy(false);
  }

  return (
    <Modal title="Edit message" onClose={onClose}>
      <form onSubmit={save}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter saves, Shift+Enter adds a new line (like sending)
            if (e.key === 'Enter' && !e.shiftKey) save(e);
          }}
          autoFocus
          rows={3}
          maxLength={4000}
          className="scroll-thin w-full resize-none rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
        />
        <button
          type="submit"
          disabled={busy || !trimmed || trimmed === message.text}
          className="mt-3 w-full rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
