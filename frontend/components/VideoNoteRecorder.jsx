'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RotateCcw, SendHorizontal, SwitchCamera, X } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { MAX_VIDEO_SECONDS, deviceError, startRecording, stopStream } from '@/lib/recording';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// 📹 Video note: a short round selfie video (up to a minute), like Telegram.
// Camera preview → record → watch it back → send. Encrypted like any photo.
export default function VideoNoteRecorder({ onSend, onCancel, onError }) {
  const previewRef = useRef(null);
  const streamRef = useRef(null);
  const recordingRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [cameraRun, setCameraRun] = useState(0); // bump to turn the camera back on
  const [phase, setPhase] = useState('starting'); // starting | ready | recording | review
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null); // { blob, duration, url, mirrored }

  useEscapeKey(onCancel);

  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  // Start (or switch) the camera until something has been recorded
  useEffect(() => {
    if (result) return;
    let cancelled = false;
    setPhase('starting');
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: { ideal: 1 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((stream) => {
        if (cancelled) return stopStream(stream);
        stopCamera();
        streamRef.current = stream;
        if (previewRef.current) previewRef.current.srcObject = stream;
        setPhase('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        onError(deviceError(err, 'video'));
        onCancel();
      });
    return () => {
      cancelled = true;
    };
  }, [facing, result, cameraRun, stopCamera]);

  // Everything off when the screen closes
  useEffect(
    () => () => {
      recordingRef.current?.cancel();
      stopCamera();
    },
    [stopCamera]
  );

  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

  // Timer, and stop at the time limit
  useEffect(() => {
    if (phase !== 'recording') return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_VIDEO_SECONDS) stop();
    }, 100);
    return () => clearInterval(timer);
  }, [phase]);

  function record() {
    if (phase !== 'ready' || !streamRef.current) return;
    // The recording owns the stream now and turns it off when it stops
    recordingRef.current = startRecording(streamRef.current, { kind: 'video' });
    streamRef.current = null;
    setSeconds(0);
    setPhase('recording');
    navigator.vibrate?.(20);
  }

  async function finish() {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) return null;
    try {
      const done = await recording.stop();
      if (done.duration < 1) {
        onError('Too short. Record for at least a second.');
        setSeconds(0);
        setCameraRun((n) => n + 1); // the recording turned the camera off
        return null;
      }
      return { ...done, mirrored: facing === 'user' };
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
    if (done) onSend({ blob: done.blob, duration: done.duration, mirrored: done.mirrored });
  }

  function retake() {
    setResult(null);
    setSeconds(0);
  }

  const progress = Math.min(1, seconds / MAX_VIDEO_SECONDS);
  const circumference = 2 * Math.PI * 49;
  const mirrorPreview = facing === 'user';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Record a video message"
    >
      <div className="flex items-center justify-between p-3">
        <button onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close">
          <X size={24} />
        </button>
        <span className="text-sm font-semibold">📹 Video message</span>
        {phase === 'ready' ? (
          <button
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Switch camera"
          >
            <SwitchCamera size={22} />
          </button>
        ) : (
          <span className="w-11" />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6">
        <div className="relative aspect-square w-full max-w-[min(20rem,60vh)]">
          <div className="absolute inset-2 overflow-hidden rounded-full bg-white/5">
            {result ? (
              <video
                key={result.url}
                src={result.url}
                autoPlay
                loop
                playsInline
                className={`h-full w-full object-cover ${result.mirrored ? '-scale-x-100' : ''}`}
              />
            ) : (
              <video
                ref={previewRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${mirrorPreview ? '-scale-x-100' : ''}`}
              />
            )}
            {phase === 'starting' && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-white/70" />
              </span>
            )}
          </div>
          {/* Time used, out of one minute */}
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="49" fill="none" strokeWidth="1" className="stroke-white/15" />
            {phase === 'recording' && (
              <circle
                cx="50"
                cy="50"
                r="49"
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="stroke-red-500"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
              />
            )}
          </svg>
        </div>

        <p className="flex h-6 items-center gap-2 text-sm tabular-nums text-white/80" aria-live="polite">
          {phase === 'recording' && (
            <>
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
              {formatDuration(seconds)} / {formatDuration(MAX_VIDEO_SECONDS)}
            </>
          )}
          {phase === 'ready' && 'Tap the button to start recording'}
          {phase === 'review' && result && `${formatDuration(result.duration)} · check it, then send`}
        </p>
      </div>

      <div className="flex items-center justify-center gap-8 p-6">
        {phase === 'review' ? (
          <>
            <button
              type="button"
              onClick={retake}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Record again"
              title="Record again"
            >
              <RotateCcw size={20} />
            </button>
            <button
              type="button"
              onClick={send}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong"
              aria-label="Send video message"
            >
              <SendHorizontal size={24} />
            </button>
            <span className="w-12" />
          </>
        ) : (
          <>
            <span className="w-12" />
            <button
              type="button"
              onClick={phase === 'recording' ? stop : record}
              disabled={phase === 'starting'}
              className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-white transition disabled:opacity-40"
              aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}
            >
              <span
                className={`bg-red-500 transition-all ${phase === 'recording' ? 'h-7 w-7 rounded-md' : 'h-13 w-13 rounded-full'}`}
              />
            </button>
            {/* While recording: send without watching it back */}
            {phase === 'recording' ? (
              <button
                type="button"
                onClick={send}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong"
                aria-label="Send now"
                title="Send now"
              >
                <SendHorizontal size={20} />
              </button>
            ) : (
              <span className="w-12" />
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
