'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Clock, Loader2, Plus, X } from 'lucide-react';
import Skeleton from './Skeleton';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';
import { SidePanel } from './UserSearch';
import { PeoplePicker } from './NewGroup';
import { api } from '@/lib/client';
import { encryptMessage, openMessage } from '@/lib/e2ee';

const MAX_RECIPIENTS = 20; // same as the backend (models/ScheduledMessage.js)

// ⏰ Scheduled messages: one message, several people, one time.
// list → 1. write the message and pick the date & time → 2. pick the people.
export default function ScheduledMessages({ onClose }) {
  const [step, setStep] = useState('list'); // list | compose | people
  const [draft, setDraft] = useState(newDraft);
  const [selected, setSelected] = useState([]);

  function startNew() {
    setDraft(newDraft());
    setSelected([]);
    setStep('compose');
  }

  if (step === 'compose') {
    return (
      <ComposeStep draft={draft} onChange={setDraft} onBack={() => setStep('list')} onNext={() => setStep('people')} />
    );
  }

  if (step === 'people') {
    return (
      <PeopleStep
        draft={draft}
        selected={selected}
        onChange={setSelected}
        onBack={() => setStep('compose')}
        onScheduled={() => setStep('list')}
      />
    );
  }

  return <ScheduledList onClose={onClose} onNew={startNew} />;
}

// "Step 1 of 2 · Message & time"
function StepHeader({ step, label }) {
  return (
    <div className="shrink-0 px-5 pt-3">
      <div className="flex gap-1.5">
        {[1, 2].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-brand' : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-muted">
        Step {step} of 2 · {label}
      </p>
    </div>
  );
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
      // An older server that doesn't know about scheduled messages answers "Not found"
      setError(
        err.status === 404
          ? 'Scheduled messages aren’t available yet: the server needs to be updated to the latest version.'
          : err.message
      );
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
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-on-brand transition hover:bg-brand-strong"
        >
          <Plus size={18} /> Schedule a message
        </button>
      </div>

      {error && <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {scheduled === null && <ListSkeleton />}

        {scheduled && scheduled.length === 0 && !error && (
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

// Placeholder cards shaped like the real ones, while the list loads
function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading scheduled messages">
      <Skeleton className="mx-2 mt-4 mb-2.5 h-3 w-20 rounded-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-2 rounded-2xl border border-line p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-36 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-3 w-full rounded-full" />
          <Skeleton className="mt-1.5 h-3 w-2/3 rounded-full" />
          <div className="mt-3 flex gap-1.5">
            {[0, 1].map((j) => (
              <div key={j} className="flex items-center gap-1.5 rounded-full bg-panel-soft py-0.5 pr-3 pl-0.5">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-2.5 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
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

// ---- Step 1: the message, and when it goes out ----

function ComposeStep({ draft, onChange, onBack, onNext }) {
  const sendAt = draftToDate(draft);
  const inFuture = sendAt && sendAt.getTime() > Date.now();
  const quickPicks = useMemo(quickTimes, []);
  const update = (changes) => onChange({ ...draft, ...changes });

  return (
    <SidePanel title="Schedule a message" onClose={onBack}>
      <StepHeader step={1} label="Message & time" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.text.trim() && inFuture) onNext();
        }}
        className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="mt-4 px-5">
          <label htmlFor="scheduled-text" className="mb-1.5 block text-sm font-medium text-brand">
            Message
          </label>
          <textarea
            id="scheduled-text"
            value={draft.text}
            onChange={(e) => update({ text: e.target.value })}
            autoFocus
            rows={4}
            maxLength={4000}
            placeholder="Happy birthday! 🎉"
            className="scroll-thin w-full resize-none rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
          />
        </div>

        <div className="mt-5 px-5">
          <p className="mb-1.5 text-sm font-medium text-brand">When should it go out?</p>
          <div className="flex flex-wrap gap-1.5">
            {quickPicks.map(({ label, date }) => {
              const pick = dateToFields(date);
              const active =
                pick.date === draft.date &&
                pick.hour === draft.hour &&
                pick.minute === draft.minute &&
                pick.period === draft.period;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => update(pick)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    active ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-line hover:bg-hover'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <p className="mt-4 mb-1 text-xs font-medium text-muted">Or pick your own date and time</p>
          <label htmlFor="scheduled-date" className="mb-1 block text-xs text-muted">
            Date
          </label>
          <input
            id="scheduled-date"
            type="date"
            value={draft.date}
            min={dateToFields(new Date()).date}
            onChange={(e) => update({ date: e.target.value })}
            className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
          />

          <TimePicker draft={draft} onChange={update} />
        </div>

        {/* Says exactly when it goes out, so there's no doubt about AM and PM */}
        <div className="mx-5 mt-4">
          {sendAt && inFuture ? (
            <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm">
              <Clock size={16} className="shrink-0 text-brand" />
              <span>
                Sends <strong className="font-semibold">{formatFull(sendAt)}</strong>
                <span className="block text-xs text-muted">{fromNow(sendAt)} · your local time</span>
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} className="shrink-0" />
              {sendAt ? 'That time has already passed. Pick a later one.' : 'Pick a date.'}
            </p>
          )}
        </div>

        <div className="mt-auto p-3 pt-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="submit"
            disabled={!draft.text.trim() || !inFuture}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-40"
          >
            Next: choose people <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1 … 12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0 … 59

// 🕘 Time on a 12-hour clock: hour, minute and an AM / PM switch.
// Always the same, whatever the device's own 12/24-hour setting is.
function TimePicker({ draft, onChange }) {
  const selectClass =
    'min-w-0 flex-1 appearance-none rounded-xl border border-line bg-panel-soft px-3 py-2.5 text-center text-base outline-none focus:border-brand md:text-sm';

  return (
    <fieldset className="mt-3">
      <legend className="mb-1 text-xs text-muted">Time (12-hour clock: choose AM or PM)</legend>
      <div className="flex items-center gap-2">
        <select
          aria-label="Hour"
          value={draft.hour}
          onChange={(e) => onChange({ hour: Number(e.target.value) })}
          className={selectClass}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="font-semibold text-muted">:</span>
        <select
          aria-label="Minute"
          value={draft.minute}
          onChange={(e) => onChange({ minute: Number(e.target.value) })}
          className={selectClass}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-line" role="radiogroup" aria-label="AM or PM">
          {['AM', 'PM'].map((period) => (
            <button
              key={period}
              type="button"
              role="radio"
              aria-checked={draft.period === period}
              onClick={() => onChange({ period })}
              className={`px-3.5 py-2.5 text-sm font-medium transition ${
                draft.period === period ? 'bg-brand text-on-brand' : 'bg-panel-soft text-muted hover:bg-hover'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted">AM = midnight to noon · PM = noon to midnight</p>
    </fieldset>
  );
}

// ---- Step 2: who gets it ----

function PeopleStep({ draft, selected, onChange, onBack, onScheduled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sendAt = draftToDate(draft);

  async function schedule() {
    if (!sendAt || sendAt.getTime() <= Date.now()) {
      setError('That time has already passed. Go back and pick a later one.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // One encrypted copy per person, locked for them and for me, like sending it now
      const text = draft.text.trim();
      const items = [];
      for (const person of selected) {
        const { conversation } = await api('/api/conversations', { method: 'POST', body: { userId: person._id } });
        const { encrypted } = await encryptMessage({
          conversationId: conversation._id,
          members: conversation.participants,
          payload: { text },
        });
        items.push({ conversationId: conversation._id, ...encrypted });
      }
      await api('/api/scheduled', { method: 'POST', body: { sendAt: sendAt.toISOString(), items } });
      onScheduled();
    } catch (err) {
      setError(
        err.status === 404
          ? 'Scheduled messages aren’t available yet: the server needs to be updated to the latest version.'
          : err.message
      );
      setBusy(false);
    }
  }

  return (
    <SidePanel title="Send to…" onClose={onBack}>
      <StepHeader step={2} label={`Choose people (up to ${MAX_RECIPIENTS})`} />
      <PeoplePicker selected={selected} onChange={(people) => onChange(people.slice(0, MAX_RECIPIENTS))} />
      <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {sendAt && (
          <p className="mb-2 flex items-center justify-center gap-1.5 text-xs text-muted">
            <Clock size={13} /> Sends {formatFull(sendAt)}
          </p>
        )}
        {error && <p className="mb-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          onClick={schedule}
          disabled={busy || selected.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-40"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Clock size={18} />}
          {selected.length === 0
            ? 'Choose at least one person'
            : `Schedule for ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`}
        </button>
      </div>
    </SidePanel>
  );
}

// ---- Dates ----
// A draft keeps the time the way it's picked: date "2026-09-24", hour 1–12, minute, "AM" | "PM".

function dateToFields(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const hours = date.getHours();
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hour: hours % 12 || 12,
    minute: date.getMinutes(),
    period: hours < 12 ? 'AM' : 'PM',
  };
}

// The picked date and time in this device's time zone, or null without a date
function draftToDate({ date, hour, minute, period }) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const hours = (hour % 12) + (period === 'PM' ? 12 : 0); // 12 AM = 0:00, 12 PM = 12:00
  return new Date(year, month - 1, day, hours, minute, 0, 0);
}

// Starts at the next full hour
function newDraft() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return { text: '', ...dateToFields(date) };
}

function quickTimes() {
  const now = new Date();
  const at = (daysAhead, hours) => {
    const date = new Date(now);
    date.setDate(date.getDate() + daysAhead);
    date.setHours(hours, 0, 0, 0);
    return date;
  };
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);
  inAnHour.setSeconds(0, 0);
  const picks = [{ label: 'In 1 hour', date: inAnHour }];
  if (at(0, 21) > now) picks.push({ label: 'Tonight 9 PM', date: at(0, 21) });
  picks.push({ label: 'Tomorrow 9 AM', date: at(1, 9) });
  picks.push({ label: 'Midnight 🎂', date: at(1, 0) });
  return picks;
}

// Always 12-hour with AM/PM, whatever the device's setting
const timeOf = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

// "today at 9:00 PM", "tomorrow at 9:00 AM", "Sat, 12 Oct at 9:00 AM"
function formatWhen(value) {
  const date = new Date(value);
  const time = timeOf(date);
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

// "Thursday, 24 September at 9:30 PM"
function formatFull(date) {
  return `${date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} at ${timeOf(date)}`;
}

// "in 2 hours 30 min", "in 3 days"
function fromNow(date) {
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (minutes < 1) return 'in less than a minute';
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} min` : ''}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

