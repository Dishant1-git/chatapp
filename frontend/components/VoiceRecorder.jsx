'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, SendHorizontal, Square, Trash2 } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { MAX_VOICE_SECONDS, WAVEFORM_BARS, deviceError, startRecording, stopStream } from '@/lib/recording';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// 🎤 Takes the place of the message box while recording a voice message.
// Recording → (stop) listen back → send, or send straight away while recording.
export default function VoiceRecorder({ onSend, onCancel, onError }) {
  const recordingRef = useRef(null);
  const audioRef = useRef(null);
  const [phase, setPhase] = useState('starting'); // starting | recording | review
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(() => Array(WAVEFORM_BARS).fill(0));
  const [result, setResult] = useState(null); // { blob, duration, waveform, url }
  const [isPlaying, setIsPlaying] = useState(false);

  useEscapeKey(onCancel);

  // Ask for the microphone and start recording straight away
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        if (cancelled) return stopStream(stream);
        recordingRef.current = startRecording(stream, {
          kind: 'audio',
          onLevel: (level) => setLevels((prev) => [...prev.slice(1), level]),
        });
        setPhase('recording');
        navigator.vibrate?.(20);
      })
      .catch((err) => {
        if (cancelled) return;
        onError(deviceError(err, 'audio'));
        onCancel();
      });
    return () => {
      cancelled = true;
      recordingRef.current?.cancel();
      recordingRef.current = null;
    };
    // Runs once: the parent's callbacks don't restart the microphone
  }, []);

  // Timer, and stop at the time limit
  useEffect(() => {
    if (phase !== 'recording') return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) stop();
    }, 200);
    return () => clearInterval(timer);
  }, [phase]);

  // Free the preview when done
  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

  async function finish() {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) return null;
    try {
      const done = await recording.stop();
      if (done.duration < 0.5) {
        onError('Too short. Tap the mic, then speak.');
        onCancel();
        return null;
      }
      return done;
    } catch (err) {
      onError(err.message);
      onCancel();
      return null;
    }
  }

  async function stop() {
    const done = await finish();
    if (!done) return;
    setResult({ ...done, url: URL.createObjectURL(done.blob) });
    setPhase('review');
  }

  async function send() {
    const done = phase === 'review' ? result : await finish();
    if (done) onSend({ blob: done.blob, duration: done.duration, waveform: done.waveform });
  }

  function togglePreview() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition';

  return (
    <div className="flex items-center gap-1 px-2 py-2 md:px-3" role="group" aria-label="Voice message recorder">
      <button type="button" onClick={onCancel} className={`${iconButton} text-red-500 hover:bg-hover`} aria-label="Discard voice message">
        <Trash2 size={21} />
      </button>

      <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-3xl bg-panel-soft px-4">
        {phase === 'starting' && (
          <span className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Starting microphone…
          </span>
        )}

        {phase === 'recording' && (
          <>
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span className="w-10 shrink-0 text-sm tabular-nums" aria-live="off">
              {formatDuration(seconds)}
            </span>
            {/* Live level meter */}
            <span className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
              {levels.map((level, i) => (
                <span key={i} className="w-[3px] shrink-0 rounded-full bg-brand" style={{ height: `${Math.max(10, level * 100)}%` }} />
              ))}
            </span>
          </>
        )}

        {phase === 'review' && result && (
          <>
            <audio ref={audioRef} src={result.url} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} />
            <button
              type="button"
              onClick={togglePreview}
              className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-brand hover:bg-hover"
              aria-label={isPlaying ? 'Pause' : 'Listen back'}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <span className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
              {result.waveform.map((value, i) => (
                <span key={i} className="w-[3px] shrink-0 grow rounded-full bg-brand/70" style={{ height: `${Math.max(12, (value / 31) * 100)}%` }} />
              ))}
            </span>
            <span className="shrink-0 text-sm text-muted tabular-nums">{formatDuration(result.duration)}</span>
          </>
        )}
      </div>

      {phase === 'recording' && (
        <button type="button" onClick={stop} className={`${iconButton} text-muted hover:bg-hover hover:text-fg`} aria-label="Stop and listen back" title="Stop and listen back">
          <Square size={18} fill="currentColor" />
        </button>
      )}

      <button
        type="button"
        onClick={send}
        disabled={phase === 'starting'}
        className={`${iconButton} bg-brand text-white hover:bg-brand-strong disabled:opacity-40`}
        aria-label="Send voice message"
      >
        <SendHorizontal size={20} />
      </button>
    </div>
  );
}
