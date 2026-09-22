'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ImagePlus, Loader2, RotateCcw, SendHorizontal, SwitchCamera, X } from 'lucide-react';
import { checkImageFile } from './ImagePreview';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// 👻 Ghost Click: take a photo with the in-app camera and send it as
// "view once" (opens one time, then it's gone) or "can be saved".
// The photo is encrypted like any other chat photo before it's uploaded.

export const GHOST_CLICK_MODES = {
  once: { emoji: '👻', label: 'View once', hint: 'They can open it one time, then it’s gone' },
  keep: { emoji: '💾', label: 'Can be saved', hint: 'Stays in the chat and can be downloaded' },
};

export function GhostClickCamera({ onSend, onCancel, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [isReady, setIsReady] = useState(false); // the shutter works once the camera shows a picture
  const [cameraError, setCameraError] = useState('');
  const [photo, setPhoto] = useState(null); // { file, url }
  const [mode, setMode] = useState('once');
  const [caption, setCaption] = useState('');

  useEscapeKey(onCancel);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start (or switch) the camera while no photo has been taken
  useEffect(() => {
    if (photo) return;
    let cancelled = false;
    setCameraError('');
    setIsReady(false);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        stopCamera();
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => !cancelled && setCameraError('Camera not available. You can pick a photo instead.'));
    if (!navigator.mediaDevices) setCameraError('Camera not available. You can pick a photo instead.');
    return () => {
      cancelled = true;
    };
  }, [facing, photo, stopCamera]);

  // Turn the camera off when the screen closes
  useEffect(() => stopCamera, [stopCamera]);

  // Free the preview when the photo changes or the screen closes
  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

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
        setPhoto({ file, url: URL.createObjectURL(file) });
      },
      'image/jpeg',
      0.9
    );
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return onError(problem);
    stopCamera();
    setPhoto({ file, url: URL.createObjectURL(file) });
  }

  function send(event) {
    event.preventDefault();
    if (!photo) return;
    onSend(photo.file, caption.trim(), mode);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Ghost Click camera"
    >
      <div className="flex items-center justify-between p-3">
        <button onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close camera">
          <X size={24} />
        </button>
        <span className="text-sm font-semibold">👻 Ghost Click</span>
        {!photo && !cameraError ? (
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
        {photo ? (
          <img src={photo.url} alt="Your Ghost Click" className="max-h-full max-w-full rounded-2xl object-contain" />
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

      {photo ? (
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
              onClick={() => setPhoto(null)}
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
          <div className="flex items-center justify-center gap-10 p-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Pick a photo instead"
              title="Pick a photo"
            >
              <ImagePlus size={22} />
            </button>
            <button
              onClick={takePhoto}
              disabled={!isReady}
              className="h-18 w-18 rounded-full border-4 border-white bg-white/20 transition hover:bg-white/40 active:scale-95 disabled:opacity-40"
              aria-label="Take photo"
            />
            <span className="w-11" />
          </div>
        )
      )}
    </motion.div>
  );
}

// Full-screen view of a Ghost Click. View-once photos can't be saved from here
// and disappear when closed. (No website can stop someone photographing their
// own screen, though.)
export function GhostClickViewer({ src, mode, caption, senderName, onClose }) {
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
              download="ghost-click.jpg"
              className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm hover:bg-white/10"
              aria-label="Save photo"
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
        {src ? (
          <img src={src} alt="Ghost Click" draggable={false} className="max-h-full max-w-full rounded-2xl object-contain" />
        ) : (
          <Loader2 className="animate-spin text-white/60" size={28} />
        )}
      </div>
      {caption && <p className="mx-auto max-w-2xl px-5 pb-5 text-center text-sm">{caption}</p>}
    </motion.div>
  );
}
