'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import { SidePanel } from './UserSearch';
import { TabPill } from './ChatList';
import { useChat } from './ChatProvider';
import { useCalls } from './CallProvider';
import Avatar from './Avatar';
import { PeopleSkeleton } from './Skeleton';
import { api } from '@/lib/client';
import { formatDuration, formatListDate } from '@/lib/format';

// 📞 The call log: every call in my chats, newest first, split the same way the
// chat list is. Calls live in the chats themselves (a note at the end of each
// one), so this screen just gathers them in one place.
export default function Calls({ onClose }) {
  const { setSidebarPanel } = useChat();
  const { startCall } = useCalls();
  const router = useRouter();
  const [tab, setTab] = useState('friends');
  const [calls, setCalls] = useState(null); // null while loading
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    api('/api/calls/history')
      .then((data) => {
        if (cancelled) return;
        setCalls(data.calls);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        // An older server doesn't have the call log yet
        setError(
          err.status === 404
            ? 'Call logs aren’t available yet: the server needs to be updated to the latest version.'
            : err.message
        );
        setCalls([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = (calls || []).filter((call) => call.isGroup === (tab === 'groups'));

  function openChat(call) {
    setSidebarPanel(null);
    router.push(`/chat/${call.conversationId}`);
  }

  async function callBack(call, video) {
    setBusy(call._id);
    try {
      await startCall(call.conversationId, video);
      setSidebarPanel(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <SidePanel title="Calls" onClose={onClose}>
      <div className="flex items-center gap-2 px-3 pb-2">
        <TabPill label="Friends" isActive={tab === 'friends'} onClick={() => setTab('friends')} />
        <TabPill label="Groups" isActive={tab === 'groups'} onClick={() => setTab('groups')} />
      </div>

      {error && <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        {calls === null && (
          <li>
            <PeopleSkeleton rows={5} />
          </li>
        )}

        {calls !== null && shown.length === 0 && !error && (
          <li className="px-8 py-16 text-center">
            <Phone size={30} className="mx-auto text-muted" />
            <p className="mt-3 font-medium">No calls yet</p>
            <p className="mt-1 text-sm text-muted">
              {tab === 'groups' ? 'Group calls you join will show up here.' : 'Start a call with a friend and it lands here.'}
            </p>
          </li>
        )}

        {shown.map((call) => (
          <CallRow
            key={call._id}
            call={call}
            isBusy={busy === call._id}
            onOpen={() => openChat(call)}
            onCallBack={(video) => callBack(call, video)}
          />
        ))}
      </ul>
    </SidePanel>
  );
}

function CallRow({ call, isBusy, onOpen, onCallBack }) {
  const missed = !call.duration && !call.outgoing;
  const Icon = missed ? PhoneMissed : call.outgoing ? PhoneOutgoing : PhoneIncoming;

  // "Video call · 3:12", "Declined", "No answer"
  const kind = call.video ? 'Video' : 'Voice';
  const what = call.duration
    ? `${kind} · ${formatDuration(call.duration)}`
    : call.reason === 'declined'
      ? `${kind} · Declined`
      : call.outgoing
        ? `${kind} · No answer`
        : `Missed ${call.video ? 'video' : 'voice'} call`;

  return (
    <li className="mx-2 flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition hover:bg-hover">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar
          user={{ name: call.name, profileImage: call.image, _id: call.otherUserId }}
          size={44}
          isGroup={call.isGroup}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{call.name}</span>
          <span className={`flex items-center gap-1.5 text-xs ${missed ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
            <Icon size={13} className="shrink-0" />
            <span className="truncate">{what}</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted">{formatListDate(call.at)}</span>
      </button>

      <button
        type="button"
        onClick={() => onCallBack(call.video)}
        disabled={isBusy}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand transition hover:bg-hover disabled:opacity-50"
        aria-label={`Call ${call.name} back`}
        title={call.video ? 'Video call' : 'Voice call'}
      >
        {call.video ? <Video size={17} /> : <Phone size={17} />}
      </button>
    </li>
  );
}
