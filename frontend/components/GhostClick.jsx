'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ImagePlus, Loader2, RotateCcw, SendHorizontal, SwitchCamera, X } from 'lucide-react';
import { checkImageFile } from './ImagePreview';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { MAX_VIDEO_SECONDS, deviceError, startRecording, stopStream } from '@/lib/recording';

// 👻 Ghost Click: one camera for both photos and videos. Tap the round button
// for a photo, hold it to record a video. Then send it as "view once" (opens one
// time, then it's gone) or "can be saved".
// Everything is encrypted like any other chat photo before it's uploaded.

export const GHOST_CLICK_MODES = {
  once: { emoji: '👻', label: 'View once', hint: 'They can open it one time, then it’s gone' },
  keep: { emoji: '💾', label: 'Can be saved', hint: 'Stays in the chat and can be downloaded' },
};

// Holding the button this long starts recording instead of taking a photo
const HOLD_MS = 350;

export function GhostClickCamera({ onSend, onCancel, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const recordingRef = useRef(null);
  const holdTimer = useRef(null);
  const [facing, setFacing] = useState('user');
  const [cameraRun, setCameraRun] = useState(0); // bump to turn the camera back on
  const [isReady, setIsReady] = useState(false); // the button works once the camera shows a picture
  const [cameraError, setCameraError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // What was captured: { kind: 'image' | 'video', file?, blob?, url, duration?, mirrored? }
  const [shot, setShot] = useState(null);
  const [mode, setMode] = useState('once');
  const [caption, setCaption] = useState('');

  useEscapeKey(onCancel);

  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  // Start (or switch) the camera while nothing has been captured.
  // The microphone is included so held-down videos have sound.
  useEffect(() => {
    if (shot) return;
    let cancelled = false;
    setCameraError('');
    setIsReady(false);
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((stream) => {
        if (cancelled) return stopStream(stream);
        stopCamera();
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => !cancelled && setCameraError(`${deviceError(err, 'video')} You can pick a photo instead.`));
    if (!navigator.mediaDevices) setCameraError('Camera not available. You can pick a photo instead.');
    return () => {
      cancelled = true;
    };
  }, [facing, shot, cameraRun, stopCamera]);

  // Turn the camera off when the screen closes
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current);
      recordingRef.current?.cancel();
      stopCamera();
    },
    [stopCamera]
  );

  // Free the preview when the capture changes or the screen closes
  useEffect(() => () => shot && URL.revokeObjectURL(shot.url), [shot]);

  // Counts up while recording and stops at the time limit
  useEffect(() => {
    if (!isRecording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_VIDEO_SECONDS) stopVideo();
    }, 100);
    return () => clearInterval(timer);
  }, [isRecording]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    // The front camera preview is mirrored; save the photo the same way the user saw it
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return onError('Could not take the photo.');
        const file = new File([blob], 'ghost-click.jpg', { type: 'image/jpeg' });
        stopCamera();
        setShot({ kind: 'image', file, url: URL.createObjectURL(file) });
      },
      'image/jpeg',
      0.9
    );
  }

  // Held down: record video until the button is let go
  function startVideo() {
    if (!streamRef.current) return;
    // The recording owns the stream now and turns it off when it stops
    recordingRef.current = startRecording(streamRef.current, { kind: 'video' });
    streamRef.current = null;
    setSeconds(0);
    setIsRecording(true);
    navigator.vibrate?.(20);
  }

  async function stopVideo() {
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!recording) return;
    try {
      const done = await recording.stop();
      if (done.duration < 1) {
        onError('Too short. Hold the button to record a video.');
        setSeconds(0);
        restartCamera();
        return;
      }
      setShot({
        kind: 'video',
        blob: done.blob,
        url: URL.createObjectURL(done.blob),
        duration: done.duration,
        mirrored: facing === 'user',
      });
    } catch (err) {
      onError(err.message);
      restartCamera();
    }
  }

  // A recording turns the camera off when it stops; this starts it again
  function restartCamera() {
    setShot(null);
    setCameraRun((n) => n + 1);
  }

  function handleHoldStart(event) {
    event.preventDefault();
    if (!isReady || recordingRef.current) return;
    holdTimer.current = setTimeout(startVideo, HOLD_MS);
  }

  // Let go before the hold started a recording → it was a tap, so take a photo
  function handleHoldEnd() {
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (recordingRef.current) stopVideo();
    else if (isReady && !shot && streamRef.current) takePhoto();
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return onError(problem);
    stopCamera();
    setShot({ kind: 'image', file, url: URL.createObjectURL(file) });
  }

  function send(event) {
    event.preventDefault();
    if (!shot) return;
    onSend({ ...shot, caption: caption.trim(), mode });
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Camera"
    >
      <div className="flex items-center justify-between p-3">
        <button onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close camera">
          <X size={24} />
        </button>
        <span className="text-sm font-semibold">
          {isRecording ? (
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="tabular-nums">{seconds.toFixed(1)}s</span>
            </span>
          ) : (
            '👻 Ghost Click'
          )}
        </span>
        {!shot && !cameraError && !isRecording ? (
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3">
        {shot ? (
          shot.kind === 'video' ? (
            <video
              src={shot.url}
              controls
              autoPlay
              loop
              playsInline
              className={`max-h-full max-w-full rounded-2xl object-contain ${shot.mirrored ? '-scale-x-100' : ''}`}
            />
          ) : (
            <img src={shot.url} alt="Your Ghost Click" className="max-h-full max-w-full rounded-2xl object-contain" />
          )
        ) : cameraError ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="max-w-xs text-sm text-white/70">{cameraError}</p>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25">
              <ImagePlus size={18} /> Pick a photo
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedData={() => setIsReady(true)}
            className={`h-full w-full rounded-2xl object-contain ${facing === 'user' ? '-scale-x-100' : ''}`}
          />
        )}
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} className="hidden" />
      </div>

      {shot ? (
        <form onSubmit={send} className="mx-auto w-full max-w-2xl space-y-3 p-3">
          {/* The sender decides: view once, or can be saved */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How can they view it?">
            {Object.entries(GHOST_CLICK_MODES).map(([key, info]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                onClick={() => setMode(key)}
                className={`rounded-2xl border px-3 py-2 text-left transition ${
                  mode === key ? 'border-white bg-white/20' : 'border-white/20 hover:bg-white/10'
                }`}
              >
                <span className="block text-sm font-semibold">
                  {info.emoji} {info.label}
                </span>
                <span className="block text-[11px] text-white/60">{info.hint}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (shot.kind === 'video' ? restartCamera() : setShot(null))}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Retake"
              title="Retake"
            >
              <RotateCcw size={20} />
            </button>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption…"
              maxLength={4000}
              className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-3 text-base text-white outline-none placeholder:text-white/50 md:text-sm"
            />
            <button
              type="submit"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong"
              aria-label="Send Ghost Click"
            >
              <SendHorizontal size={20} />
            </button>
          </div>
        </form>
      ) : (
        !cameraError && (
          <div className="flex flex-col items-center gap-2 p-5">
            <p className="text-[11px] text-white/50">{isRecording ? 'Let go to stop' : 'Tap for a photo · hold to record a video'}</p>
            <div className="flex items-center justify-center gap-10">
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 ${isRecording ? 'invisible' : ''}`}
                aria-label="Pick a photo instead"
                title="Pick a photo"
              >
                <ImagePlus size={22} />
              </button>
              {/* Tap = photo, hold = video */}
              <button
                onPointerDown={handleHoldStart}
                onPointerUp={handleHoldEnd}
                onPointerLeave={handleHoldEnd}
                onContextMenu={(e) => e.preventDefault()}
                disabled={!isReady}
                className={`relative h-18 w-18 rounded-full border-4 transition active:scale-95 disabled:opacity-40 ${
                  isRecording ? 'scale-110 border-red-500 bg-red-500/40' : 'border-white bg-white/20 hover:bg-white/40'
                }`}
                aria-label={isRecording ? 'Stop recording' : 'Take photo or hold to record'}
              >
                {isRecording && (
                  <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-1 -rotate-90" aria-hidden>
                    <circle
                      cx="50"
                      cy="50"
                      r="47"
                      fill="none"
                      strokeWidth="4"
                      strokeLinecap="round"
                      className="stroke-red-500"
                      strokeDasharray={2 * Math.PI * 47}
                      strokeDashoffset={2 * Math.PI * 47 * (1 - Math.min(1, seconds / MAX_VIDEO_SECONDS))}
                    />
                  </svg>
                )}
              </button>
              <span className="w-11" />
            </div>
          </div>
        )
      )}
    </motion.div>
  );
}

// Full-screen view of a Ghost Click photo or video. View-once ones can't be saved
// from here and disappear when closed. (No website can stop someone photographing
// their own screen, though.)
export function GhostClickViewer({ src, kind = 'image', mirrored = false, mode, caption, senderName, onClose }) {
  useEscapeKey(onClose);
  const isOnce = mode === 'once';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Ghost Click"
      onContextMenu={(e) => isOnce && e.preventDefault()}
    >
      <div className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">👻 {senderName}</p>
          <p className="text-xs text-white/60">{isOnce ? 'View once — gone when you close it' : 'Ghost Click'}</p>
        </div>
        <div className="flex items-center gap-1">
          {!isOnce && src && (
            <a
              href={src}
              download={kind === 'video' ? 'ghost-click.webm' : 'ghost-click.jpg'}
              className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm hover:bg-white/10"
              aria-label={kind === 'video' ? 'Save video' : 'Save photo'}
            >
              <Download size={18} /> Save
            </a>
          )}
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close">
            <X size={24} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {!src ? (
          <Loader2 className="animate-spin text-white/60" size={28} />
        ) : kind === 'video' ? (
          <video
            src={src}
            autoPlay
            controls={!isOnce}
            playsInline
            onContextMenu={(e) => isOnce && e.preventDefault()}
            className={`max-h-full max-w-full rounded-2xl object-contain ${mirrored ? '-scale-x-100' : ''}`}
          />
        ) : (
          <img src={src} alt="Ghost Click" draggable={false} className="max-h-full max-w-full rounded-2xl object-contain" />
        )}
      </div>
      {caption && <p className="mx-auto max-w-2xl px-5 pb-5 text-center text-sm">{caption}</p>}
    </motion.div>
  );
}
