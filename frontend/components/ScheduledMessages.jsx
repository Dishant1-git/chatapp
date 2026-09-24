'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Clock, Loader2, Plus, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';
import { SidePanel } from './UserSearch';
import { PeoplePicker } from './NewGroup';
import { api } from '@/lib/client';
import { encryptMessage, openMessage } from '@/lib/e2ee';

const MAX_RECIPIENTS = 20; // same as the backend (models/ScheduledMessage.js)

// ⏰ Scheduled messages: one message, several people, one time.
// list → pick people → write the message and pick the time.
export default function ScheduledMessages({ onClose }) {
  const [step, setStep] = useState('list'); // list | people | compose
  const [selected, setSelected] = useState([]);

  function startNew() {
    setSelected([]);
    setStep('people');
  }

  if (step === 'people') {
    return (
      <SidePanel title="Send to…" onClose={() => setStep('list')}>
        <PeoplePicker selected={selected} onChange={(people) => setSelected(people.slice(0, MAX_RECIPIENTS))} />
        <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setStep('compose')}
            disabled={selected.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-white transition hover:bg-brand-strong disabled:opacity-40"
          >
            Next{selected.length > 0 && ` · ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`}
            <ArrowRight size={18} />
          </button>
        </div>
      </SidePanel>
    );
  }

  if (step === 'compose') {
    return <Compose people={selected} onBack={() => setStep('people')} onScheduled={() => setStep('list')} />;
  }

  return <ScheduledList onClose={onClose} onNew={startNew} />;
}

// ---- The list of scheduled messages ----

function ScheduledList({ onClose, onNew }) {
  const { socket, user } = useChat();
  const [scheduled, setScheduled] = useState(null); // null while loading
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api('/api/scheduled');
      // Decrypt my own copy of each message to show what it says
      const opened = await Promise.all(
        data.scheduled.map(async (s) => {
          const item = s.items[0];
          const message = item
            ? await openMessage({ ...item, _id: `scheduled-${s._id}`, senderId: user._id }, String(item.conversationId))
            : null;
          return { ...s, text: message?.undecryptable ? '' : message?.text || '' };
        })
      );
      setScheduled(opened);
      setError('');
    } catch (err) {
      setError(err.message);
      setScheduled((prev) => prev || []);
    }
  }, [user._id]);

  useEffect(() => {
    load();
  }, [load]);

  // A message went out (the server tells us), so its status changed
  useEffect(() => {
    if (!socket) return;
    socket.on('scheduled:updated', load);
    return () => socket.off('scheduled:updated', load);
  }, [socket, load]);

  async function cancel(id) {
    try {
      await api(`/api/scheduled/${id}`, { method: 'DELETE' });
      setScheduled((prev) => prev.map((s) => (s._id === id ? { ...s, status: 'cancelled' } : s)));
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  const upcoming = (scheduled || []).filter((s) => s.status === 'pending' || s.status === 'sending');
  const past = (scheduled || []).filter((s) => s.status === 'done' || s.status === 'cancelled').reverse();

  return (
    <SidePanel title="Scheduled messages" onClose={onClose}>
      <div className="shrink-0 px-3 py-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-white transition hover:bg-brand-strong"
        >
          <Plus size={18} /> Schedule a message
        </button>
      </div>

      {error && <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {scheduled === null && (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}

        {scheduled && scheduled.length === 0 && (
          <div className="px-6 py-12 text-center">
            <Clock size={32} className="mx-auto text-muted" />
            <p className="mt-3 font-medium">Nothing scheduled</p>
            <p className="mt-1 text-sm text-muted">
              Write a message once, pick the people and a time, and it goes to each of them then.
            </p>
          </div>
        )}

        {upcoming.length > 0 && <SectionTitle>Upcoming</SectionTitle>}
        {upcoming.map((s) => (
          <ScheduledCard key={s._id} scheduled={s} onCancel={() => cancel(s._id)} />
        ))}

        {past.length > 0 && <SectionTitle>Last 7 days</SectionTitle>}
        {past.map((s) => (
          <ScheduledCard key={s._id} scheduled={s} />
        ))}
      </div>
    </SidePanel>
  );
}

function SectionTitle({ children }) {
  return <p className="px-2 pt-3 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{children}</p>;
}

function ScheduledCard({ scheduled, onCancel }) {
  const { status, sendAt, items, text } = scheduled;
  const isUpcoming = status === 'pending' || status === 'sending';
  const failed = items.filter((i) => i.status === 'failed');

  return (
    <div className={`mb-2 rounded-2xl border border-line p-3 ${status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Clock size={14} className="shrink-0 text-brand" />
          <span className="inline-block first-letter:uppercase">{formatWhen(sendAt)}</span>
        </p>
        <StatusBadge scheduled={scheduled} />
      </div>

      <p className="mt-2 line-clamp-3 text-sm break-words whitespace-pre-wrap">
        {text || <span className="text-muted italic">🔒 Message</span>}
      </p>

      {/* Who it's for, with a tick or a warning once it went out */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={String(item.conversationId)}
            className="flex items-center gap-1.5 rounded-full bg-panel-soft py-0.5 pr-2.5 pl-0.5 text-xs"
            title={item.error || undefined}
          >
            <Avatar user={item.recipientId} size={20} />
            {item.recipientId?.name || 'Someone'}
            {item.status === 'sent' && <Check size={12} className="text-brand" />}
            {item.status === 'failed' && <AlertCircle size={12} className="text-red-500" />}
          </span>
        ))}
      </div>

      {failed.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-600 dark:text-red-400">
          {failed.map((item) => (
            <li key={String(item.conversationId)}>
              Not sent to {item.recipientId?.name || 'someone'}: {item.error}
            </li>
          ))}
        </ul>
      )}

      {isUpcoming && status === 'pending' && onCancel && (
        <button onClick={onCancel} className="mt-2.5 flex items-center gap-1 text-xs font-medium text-muted hover:text-red-600">
          <X size={13} /> Cancel
        </button>
      )}
    </div>
  );
}

function StatusBadge({ scheduled }) {
  const { status, items } = scheduled;
  const [label, className] =
    status === 'cancelled'
      ? ['Cancelled', 'bg-panel-soft text-muted']
      : status === 'done'
        ? items.every((i) => i.status === 'sent')
          ? ['Sent', 'bg-brand-soft text-brand']
          : ['Partly sent', 'bg-amber-500/15 text-amber-700 dark:text-amber-400']
        : status === 'sending'
          ? ['Sending…', 'bg-brand-soft text-brand']
          : ['Scheduled', 'bg-panel-soft text-muted'];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{label}</span>;
}

// ---- Writing the message and picking the time ----

function Compose({ people, onBack, onScheduled }) {
  const [text, setText] = useState('');
  const [when, setWhen] = useState(() => toLocalInput(nextRoundHour()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const quickPicks = useMemo(quickTimes, []);

  const sendAt = when ? new Date(when) : null;
  const inFuture = sendAt && sendAt.getTime() > Date.now();

  async function schedule(event) {
    event.preventDefault();
    if (!text.trim()) return setError('Write a message first.');
    if (!inFuture) return setError('Pick a time in the future.');

    setBusy(true);
    setError('');
    try {
      // One encrypted copy per person, locked for them and for me, like sending it now
      const items = [];
      for (const person of people) {
        const { conversation } = await api('/api/conversations', { method: 'POST', body: { userId: person._id } });
        const { encrypted } = await encryptMessage({
          conversationId: conversation._id,
          members: conversation.participants,
          payload: { text: text.trim() },
        });
        items.push({ conversationId: conversation._id, ...encrypted });
      }
      await api('/api/scheduled', { method: 'POST', body: { sendAt: sendAt.toISOString(), items } });
      onScheduled();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <SidePanel title="Schedule message" onClose={onBack}>
      <form onSubmit={schedule} className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="px-5 pt-4">
          <p className="mb-1.5 text-sm font-medium text-brand">To</p>
          <ul className="flex flex-wrap gap-1.5">
            {people.map((person) => (
              <li key={person._id} className="flex items-center gap-1.5 rounded-full bg-panel-soft py-0.5 pr-3 pl-0.5 text-sm">
                <Avatar user={person} size={22} />
                {person.name}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted">Each person gets it in your own chat with them. They won’t see who else got it.</p>
        </div>

        <div className="mt-5 px-5">
          <label htmlFor="scheduled-text" className="mb-1.5 block text-sm font-medium text-brand">
            Message
          </label>
          <textarea
            id="scheduled-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={4}
            maxLength={4000}
            placeholder="Happy birthday! 🎉"
            className="scroll-thin w-full resize-none rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
          />
        </div>

        <div className="mt-4 px-5">
          <label htmlFor="scheduled-when" className="mb-1.5 block text-sm font-medium text-brand">
            Send at
          </label>
          <input
            id="scheduled-when"
            type="datetime-local"
            value={when}
            min={toLocalInput(new Date())}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickPicks.map(({ label, date }) => (
              <button
                key={label}
                type="button"
                onClick={() => setWhen(toLocalInput(date))}
                className="rounded-full border border-line px-2.5 py-1 text-xs hover:bg-hover"
              >
                {label}
              </button>
            ))}
          </div>
          {sendAt && inFuture && <p className="mt-2 text-xs text-muted">Goes out {formatWhen(sendAt)}.</p>}
        </div>

        {error && <p className="mx-5 mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-auto p-3 pt-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="submit"
            disabled={busy || !text.trim() || !inFuture}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-white transition hover:bg-brand-strong disabled:opacity-40"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Clock size={18} />}
            Schedule for {people.length} {people.length === 1 ? 'person' : 'people'}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

// ---- Dates ----

// The value a <input type="datetime-local"> expects, in this device's time zone
function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextRoundHour() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
}

function quickTimes() {
  const now = new Date();
  const at = (daysAhead, hours) => {
    const date = new Date(now);
    date.setDate(date.getDate() + daysAhead);
    date.setHours(hours, 0, 0, 0);
    return date;
  };
  const picks = [{ label: 'In 1 hour', date: new Date(now.getTime() + 60 * 60 * 1000) }];
  if (at(0, 21) > now) picks.push({ label: 'Tonight 9 PM', date: at(0, 21) });
  picks.push({ label: 'Tomorrow 9 AM', date: at(1, 9) });
  picks.push({ label: 'Midnight 🎂', date: at(1, 0) });
  return picks;
}

// "Today at 9:00 PM", "Tomorrow at 9:00 AM", "Sat, 12 Oct at 9:00 AM"
function formatWhen(value) {
  const date = new Date(value);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return `today at ${time}`;
  if (sameDay(date, tomorrow)) return `tomorrow at ${time}`;
  if (sameDay(date, yesterday)) return `yesterday at ${time}`;
  return `${date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`;
}
