'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Pause, Play } from 'lucide-react';
import { decryptMedia } from '@/lib/e2ee';
import { formatDuration } from '@/lib/format';
import { WAVEFORM_BARS } from '@/lib/recording';

// Resolves a message's voice message or video note to something <audio>/<video>
// can play: the sender's local copy, or a decrypted copy of the encrypted file.
export function useMessageMedia(message) {
  const url = message?.media || '';
  const needsDecrypting = !message?.localMedia && Boolean(url);
  const [state, setState] = useState({ url: '', src: '', failed: false });

  useEffect(() => {
    if (!needsDecrypting) return;
    let cancelled = false;
    if (!message.contentKey) {
      setState({ url, src: '', failed: true });
      return;
    }
    decryptMedia(url, message.contentKey, message.mediaType)
      .then((src) => !cancelled && setState({ url, src, failed: false }))
      .catch(() => !cancelled && setState({ url, src: '', failed: true }));
    return () => {
      cancelled = true;
    };
  }, [url, needsDecrypting, message?.contentKey, message?.mediaType]);

  if (message?.localMedia) return { src: message.localMedia, failed: false };
  return state.url === url ? { src: state.src, failed: state.failed } : { src: '', failed: false };
}

// Only one recording plays at a time: starting one pauses the others
let nowPlaying = null;
function claimPlayback(element) {
  if (nowPlaying && nowPlaying !== element) nowPlaying.pause();
  nowPlaying = element;
}

// Recordings made by Chrome don't say how long they are until they've been read
// to the end, which breaks seeking. Jumping far ahead makes the browser work it out.
function fixUnknownDuration(element) {
  if (Number.isFinite(element.duration)) return;
  const restore = () => {
    element.removeEventListener('durationchange', restore);
    element.currentTime = 0;
  };
  element.addEventListener('durationchange', restore);
  element.currentTime = 1e101;
}

// Shared play/pause/progress state for an <audio> or <video> element
function usePlayer(fallbackDuration) {
  const ref = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [realDuration, setRealDuration] = useState(0);
  const duration = realDuration || fallbackDuration || 0;

  const events = {
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onEnded: () => {
      setIsPlaying(false);
      setPosition(0);
      if (ref.current) ref.current.currentTime = 0;
    },
    // (ignores the jump made by fixUnknownDuration)
    onTimeUpdate: (e) => Number.isFinite(e.currentTarget.duration) && setPosition(e.currentTarget.currentTime),
    onLoadedMetadata: (e) => fixUnknownDuration(e.currentTarget),
    onDurationChange: (e) => Number.isFinite(e.currentTarget.duration) && setRealDuration(e.currentTarget.duration),
  };

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      claimPlayback(el);
      el.play().catch(() => setIsPlaying(false));
    } else {
      el.pause();
    }
  }

  function seek(fraction) {
    const el = ref.current;
    if (!el || !duration) return;
    el.currentTime = Math.min(duration, Math.max(0, fraction * duration));
    setPosition(el.currentTime);
  }

  return { ref, isPlaying, position, duration, progress: duration ? Math.min(1, position / duration) : 0, events, toggle, seek };
}

const SPEEDS = [1, 1.5, 2];

// 🎤 A voice message: play button, waveform (tap to seek), time and speed
export function VoiceNote({ message, isMine }) {
  const { src, failed } = useMessageMedia(message);
  const player = usePlayer(message.mediaDuration);
  const [speed, setSpeed] = useState(1);
  const waveform = message.mediaWaveform?.length ? message.mediaWaveform : Array(WAVEFORM_BARS).fill(4);

  useEffect(() => {
    if (player.ref.current) player.ref.current.playbackRate = speed;
  }, [speed, src, player.ref]);

  function handleSeek(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    player.seek((event.clientX - rect.left) / rect.width);
  }

  function handleSeekKey(event) {
    const step = player.duration ? 5 / player.duration : 0;
    if (event.key === 'ArrowRight') player.seek(player.progress + step);
    if (event.key === 'ArrowLeft') player.seek(player.progress - step);
  }

  const shown = player.isPlaying || player.position ? player.position : player.duration;

  return (
    <div className="flex w-60 items-center gap-2.5 pt-0.5 pb-3.5 sm:w-64">
      {src && <audio ref={player.ref} src={src} preload="metadata" {...player.events} />}
      <button
        type="button"
        onClick={player.toggle}
        disabled={!src}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong disabled:opacity-70"
        aria-label={player.isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {failed ? (
          <AlertCircle size={20} />
        ) : !src ? (
          <Loader2 size={20} className="animate-spin" />
        ) : player.isPlaying ? (
          <Pause size={20} fill="currentColor" />
        ) : (
          <Play size={20} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={src ? 0 : -1}
          aria-label="Voice message position"
          aria-valuemin={0}
          aria-valuemax={Math.round(player.duration)}
          aria-valuenow={Math.round(player.position)}
          onClick={handleSeek}
          onKeyDown={handleSeekKey}
          className="flex h-8 cursor-pointer items-center gap-[2px]"
        >
          {waveform.map((value, i) => (
            <span
              key={i}
              className={`w-[3px] shrink-0 grow rounded-full transition-colors ${
                i / waveform.length < player.progress ? 'bg-brand' : isMine ? 'bg-black/25 dark:bg-white/30' : 'bg-black/20 dark:bg-white/25'
              }`}
              style={{ height: `${Math.max(12, (value / 31) * 100)}%` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="tabular-nums">{failed ? "Couldn't load" : formatDuration(shown)}</span>
          {src && (
            <button
              type="button"
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
              className="rounded-full bg-black/10 px-1.5 font-semibold dark:bg-white/15"
              aria-label={`Playback speed ${speed}×`}
            >
              {speed}×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 📹 A round video note: tap to play with sound, a ring shows the progress
export function VideoNote({ message, time }) {
  const { src, failed } = useMessageMedia(message);
  const player = usePlayer(message.mediaDuration);
  const circumference = 2 * Math.PI * 49;

  return (
    <button
      type="button"
      onClick={player.toggle}
      disabled={!src}
      className="relative block h-56 w-56 sm:h-64 sm:w-64"
      aria-label={player.isPlaying ? 'Pause video message' : 'Play video message'}
    >
      <span className="absolute inset-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        {src ? (
          <video
            ref={player.ref}
            // #t: makes Safari show the first frame before it's played
            src={message.localMedia ? src : `${src}#t=0.001`}
            playsInline
            preload="auto"
            {...player.events}
            className={`h-full w-full object-cover ${message.mediaMirrored ? '-scale-x-100' : ''}`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted">
            {failed ? <AlertCircle size={26} /> : <Loader2 size={26} className="animate-spin" />}
          </span>
        )}
      </span>

      {/* Progress ring */}
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r="49"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="stroke-brand transition-[stroke-dashoffset] duration-200"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - player.progress)}
        />
      </svg>

      {src && !player.isPlaying && (
        <span className="absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white">
          <Play size={22} fill="currentColor" className="ml-0.5" />
        </span>
      )}

      <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white tabular-nums">
        {formatDuration(player.isPlaying || player.position ? player.position : player.duration)}
      </span>
      <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">
        {time}
      </span>
    </button>
  );
}
