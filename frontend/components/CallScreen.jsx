'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Lock,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
} from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar, { ChatAvatar } from './Avatar';
import { conversationTitle, findMember, isGroup } from '@/lib/conversations';
import { formatDuration } from '@/lib/format';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// Time since the call connected, updated every second
function useCallTimer(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt ? formatDuration((now - startedAt) / 1000) : '';
}

function statusLine(call, peers, timer) {
  if (call.status === 'calling') return 'Ringing…';
  if (call.status === 'connecting') return 'Connecting…';
  if (Object.values(peers).some((p) => p.state === 'reconnecting')) return 'Reconnecting…';
  return timer;
}

// Plays a video stream without sound (sound comes from CallProvider's <audio> elements)
function StreamVideo({ stream, mirrored = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`${className} ${mirrored ? '-scale-x-100' : ''}`}
    />
  );
}

function hasLiveVideo(stream) {
  return Boolean(stream?.getVideoTracks().some((t) => t.readyState === 'live'));
}

// ---- Incoming call ----

export function IncomingCall({ call, conversation, onAccept, onDecline }) {
  const { user } = useChat();
  const caller = findMember(conversation, call.callerId);
  const inGroup = isGroup(conversation);
  const title = inGroup ? conversation.name : caller?.name || conversationTitle(conversation) || 'Someone';
  const kind = call.video ? 'video call' : 'voice call';

  useEscapeKey(onDecline);

  return (
    <motion.div
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[55] mx-auto max-w-sm rounded-3xl border border-cotton/10 bg-noir p-5 text-cotton shadow-2xl"
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      role="alertdialog"
      aria-label={`Incoming ${kind} from ${title}`}
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/40" />
          {conversation ? <ChatAvatar conversation={conversation} size={56} /> : <Avatar user={caller} size={56} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{title}</p>
          <p className="truncate text-sm text-cotton/70">
            {inGroup && caller && caller._id !== user._id ? `${caller.name} · ` : ''}
            Incoming {kind}
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={onDecline}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-cherry py-3 font-medium transition hover:bg-maroon"
        >
          <PhoneOff size={19} /> Decline
        </button>
        <button
          onClick={onAccept}
          autoFocus
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 py-3 font-medium transition hover:bg-emerald-700"
        >
          {call.video ? <Video size={19} /> : <Phone size={19} />} Accept
        </button>
      </div>
    </motion.div>
  );
}

// ---- In a call ----

function ControlButton({ onClick, label, active = true, danger = false, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
        danger
          ? 'bg-cherry hover:bg-maroon'
          : active
            ? 'bg-cotton/15 hover:bg-cotton/25'
            : 'bg-cotton text-noir hover:bg-cotton/90'
      }`}
    >
      {children}
    </button>
  );
}

// A person in the call: their video, or their picture when the camera is off
function Tile({ person, stream, showVideo, micOff, label, mirrored = false, className = '' }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-cotton/[0.07] ${className}`}>
      {showVideo ? (
        <StreamVideo stream={stream} mirrored={mirrored} className="h-full w-full object-cover" />
      ) : (
        <Avatar user={person} size={88} />
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1 rounded-full bg-noir/50 px-2.5 py-0.5 text-xs">
        {micOff && <MicOff size={12} className="shrink-0 text-cherry-light" />}
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}

export function CallScreen({
  call,
  conversation,
  peers,
  localStream,
  micOn,
  cameraOn,
  facingMode,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  onHangUp,
  onMinimize,
}) {
  const { user } = useChat();
  const timer = useCallTimer(call.startedAt);
  const peerEntries = Object.entries(peers);
  const title = conversationTitle(conversation) || 'Call';
  const myCameraLive = call.video && cameraOn && hasLiveVideo(localStream);

  const remoteTiles = peerEntries.map(([userId, peer]) => {
    const person = findMember(conversation, userId) || { name: 'Someone' };
    return {
      userId,
      person,
      stream: peer.stream,
      showVideo: call.video && peer.video !== false && hasLiveVideo(peer.stream),
      micOff: peer.audio === false,
      label: peer.state === 'connected' ? person.name : `${person.name} · connecting…`,
    };
  });

  // One-to-one video call: the other person fills the screen, you're in the corner
  const isOneToOne = remoteTiles.length === 1 && !isGroup(conversation);
  const waiting = remoteTiles.length === 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-noir pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-cotton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <header className="relative z-10 flex items-center gap-3 px-4 py-3">
        <button
          onClick={onMinimize}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cotton/10"
          aria-label="Minimize call"
          title="Back to chats"
        >
          <Minimize2 size={20} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-semibold">{title}</p>
          <p className="flex items-center justify-center gap-1 text-xs text-cotton/60">
            <Lock size={11} /> {statusLine(call, peers, timer) || 'End-to-end encrypted'}
          </p>
        </div>
        <span className="w-10" />
      </header>

      <div className="relative min-h-0 flex-1 px-3 pb-3">
        {waiting ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            {myCameraLive ? (
              <StreamVideo
                stream={localStream}
                mirrored={facingMode === 'user'}
                className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] rounded-2xl object-cover opacity-40"
              />
            ) : null}
            <div className="relative">
              {conversation && <ChatAvatar conversation={conversation} size={120} />}
            </div>
            <p className="relative text-2xl font-semibold">{title}</p>
            <p className="relative text-cotton/70">{call.status === 'calling' ? 'Ringing…' : 'Connecting…'}</p>
          </div>
        ) : isOneToOne ? (
          <>
            <Tile {...remoteTiles[0]} className="h-full w-full" />
            {myCameraLive && (
              <StreamVideo
                stream={localStream}
                mirrored={facingMode === 'user'}
                className="absolute right-5 bottom-5 h-40 w-28 rounded-xl border border-cotton/20 object-cover shadow-lg sm:h-48 sm:w-36"
              />
            )}
          </>
        ) : (
          <div
            className={`grid h-full gap-2 ${
              remoteTiles.length + 1 <= 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : remoteTiles.length + 1 <= 4
                  ? 'grid-cols-2'
                  : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            <Tile
              person={user}
              stream={localStream}
              showVideo={myCameraLive}
              micOff={!micOn}
              label="You"
              mirrored={facingMode === 'user'}
            />
            {remoteTiles.map((tile) => (
              <Tile key={tile.userId} {...tile} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-4 px-4 pt-2 pb-6">
        <ControlButton onClick={onToggleMic} label={micOn ? 'Mute' : 'Unmute'} active={micOn}>
          {micOn ? <Mic size={22} /> : <MicOff size={22} />}
        </ControlButton>
        {call.video && (
          <ControlButton onClick={onToggleCamera} label={cameraOn ? 'Turn camera off' : 'Turn camera on'} active={cameraOn}>
            {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
          </ControlButton>
        )}
        {call.video && cameraOn && (
          <ControlButton onClick={onFlipCamera} label="Switch camera">
            <SwitchCamera size={22} />
          </ControlButton>
        )}
        <ControlButton onClick={onHangUp} label="End call" danger>
          <PhoneOff size={24} />
        </ControlButton>
      </div>
    </motion.div>
  );
}

// ---- Minimized: a small bar so you can keep chatting during a call ----

export function MinimizedCall({ call, conversation, peers, onExpand, onHangUp }) {
  const timer = useCallTimer(call.startedAt);

  return (
    // Phones: above the message box. Desktop: in the empty middle of the top bar.
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-full bg-cherry py-2 pr-2 pl-4 text-cotton shadow-xl md:top-3 md:bottom-auto">
      <button onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label="Return to call">
        {call.video ? <Video size={17} className="shrink-0" /> : <Phone size={17} className="shrink-0" />}
        <span className="truncate text-sm font-medium">{conversationTitle(conversation) || 'Call'}</span>
        <span className="shrink-0 text-xs text-cotton/80">{statusLine(call, peers, timer)}</span>
        <Maximize2 size={15} className="ml-auto shrink-0 opacity-80" />
      </button>
      <button
        onClick={onHangUp}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cherry hover:bg-maroon"
        aria-label="End call"
      >
        <PhoneOff size={17} />
      </button>
    </div>
  );
}
