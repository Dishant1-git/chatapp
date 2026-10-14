'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Eye, Folder, Loader2, SmilePlus, SwitchCamera, Trash2, X } from 'lucide-react';
import Avatar from './Avatar';
import { ImageLightbox } from './ImagePreview';
import { STICKER_PACKS, stickerUrl } from '@/lib/stickers';
import { stopStream } from '@/lib/recording';

// My own picture in the Profile panel. Tapping it opens a menu:
// View photo · Take photo · Upload photo · Emoji & sticker · Remove photo.
// Every new picture ends up as a File handed to onUpload (PATCH /api/users/me).
export default function ProfilePhoto({ user, isUploading, onUpload, onRemove }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // view | camera | maker
  const [dialog, setDialog] = useState(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const captureInputRef = useRef(null);
  const hasPhoto = Boolean(user.profileImage);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setIsMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);
  useLayerEscape(isMenuOpen, () => setIsMenuOpen(false));

  function choose(action) {
    setIsMenuOpen(false);
    action();
  }

  function takePhoto() {
    // No camera API (or an old browser): the phone's own camera app via the file picker
    if (navigator.mediaDevices?.getUserMedia) setDialog('camera');
    else captureInputRef.current?.click();
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onUpload(file);
  }

  async function handleNewPicture(file) {
    setDialog(null);
    await onUpload(file);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        disabled={isUploading}
        className="group relative block rounded-full focus-visible:outline-2 focus-visible:outline-brand"
        title="Change profile picture"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
      >
        <Avatar user={user} size={128} />
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/45 text-xs font-medium text-white transition ${
            isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <Camera size={24} />}
          {!isUploading && <span className="mt-1">Change photo</span>}
        </span>
        {/* Always visible on touch screens, where there is no hover */}
        <span className="absolute right-1 bottom-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-on-brand shadow md:hidden">
          <Camera size={17} />
        </span>
      </button>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-1/2 z-30 mt-2 w-56 -translate-x-1/2 origin-top rounded-2xl border border-line bg-panel py-1.5 text-sm text-fg shadow-xl"
          >
            {hasPhoto && <MenuItem icon={Eye} label="View photo" onClick={() => choose(() => setDialog('view'))} />}
            <MenuItem icon={Camera} label="Take photo" onClick={() => choose(takePhoto)} />
            <MenuItem icon={Folder} label="Upload photo" onClick={() => choose(() => fileInputRef.current?.click())} />
            <MenuItem icon={SmilePlus} label="Emoji & sticker" onClick={() => choose(() => setDialog('maker'))} />
            {hasPhoto && (
              <>
                <div className="mx-4 my-1.5 border-t border-line" />
                <MenuItem icon={Trash2} label="Remove photo" danger onClick={() => choose(onRemove)} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="sr-only"
        tabIndex={-1}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFile}
        className="sr-only"
        tabIndex={-1}
      />

      <AnimatePresence>
        {dialog === 'view' && hasPhoto && <ViewPhoto src={user.profileImage} onClose={() => setDialog(null)} />}
        {dialog === 'camera' && (
          <CameraDialog
            onCapture={handleNewPicture}
            onFallback={() => {
              setDialog(null);
              captureInputRef.current?.click();
            }}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'maker' && <EmojiStickerDialog onSave={handleNewPicture} onClose={() => setDialog(null)} />}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon: Icon, label, danger, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition hover:bg-hover ${
        danger ? 'text-red-600 dark:text-red-400' : ''
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {label}
    </button>
  );
}

// Escape closes only the top layer (this menu or dialog), not the Profile panel
// behind it: a capturing listener on window runs before the panel's own one.
function useLayerEscape(active, onEscape) {
  const latest = useRef(onEscape);
  latest.current = onEscape;

  useEffect(() => {
    if (!active) return;
    function handleKey(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      latest.current();
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [active]);
}

function ViewPhoto({ src, onClose }) {
  useLayerEscape(true, onClose);
  // ImageLightbox has its own Escape listener; the capturing one above gets there first.
  // Portalled out of the sliding Profile panel, whose transform would trap position: fixed
  return createPortal(<ImageLightbox src={src} onClose={onClose} />, document.body);
}

function Dialog({ title, onClose, children }) {
  useLayerEscape(true, onClose);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-panel text-fg shadow-xl"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line py-2 pr-2 pl-5">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-hover"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </motion.div>
    </motion.div>,
    document.body
  );
}

// A square picture from a canvas, as an upload-ready file
function canvasToFile(canvas, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], `profile.${type.split('/')[1]}`, { type })) : reject(new Error('Could not create the picture.'))),
      type,
      0.92
    );
  });
}

function cameraError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
    return 'Access to your camera was blocked. Allow it in your browser’s site settings.';
  }
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'No camera found.';
  if (err?.name === 'NotReadableError') return 'Your camera is being used by another app.';
  return 'Could not start the camera.';
}

// 📸 Take photo: a live, square camera preview and a shutter button
function CameraDialog({ onCapture, onFallback, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setError('');

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stopStream(stream);
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      })
      .catch((err) => !cancelled && setError(cameraError(err)));

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing]);

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    setIsSaving(true);

    // Crop the middle square, like the preview shows
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(side, 1024);
    const ctx = canvas.getContext('2d');
    // The front camera preview is mirrored; save it the way it looked
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      video,
      (video.videoWidth - side) / 2,
      (video.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height
    );

    try {
      const file = await canvasToFile(canvas);
      stopStream(streamRef.current);
      await onCapture(file);
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  }

  return (
    <Dialog title="Take photo" onClose={onClose}>
      <div className="relative mx-auto mt-4 aspect-square w-[calc(100%-2.5rem)] overflow-hidden rounded-full bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setIsReady(true)}
          className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
        />
        {!isReady && !error && (
          <span className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="animate-spin" />
          </span>
        )}
      </div>

      {error ? (
        <div className="px-5 py-4 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={onFallback} className="mt-2 text-sm font-medium text-brand hover:underline">
            Use your device’s camera app instead
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-6 px-5 py-4">
          <span className="h-11 w-11" />
          <button
            type="button"
            onClick={capture}
            disabled={!isReady || isSaving}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-brand bg-panel transition hover:bg-brand-soft disabled:opacity-50"
            aria-label="Take photo"
          >
            {isSaving ? <Loader2 className="animate-spin text-brand" /> : <span className="h-11 w-11 rounded-full bg-brand" />}
          </button>
          <button
            type="button"
            onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}
            disabled={isSaving}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
            aria-label="Switch camera"
          >
            <SwitchCamera size={20} />
          </button>
        </div>
      )}
    </Dialog>
  );
}

const PROFILE_EMOJIS = [
  '😀', '😎', '🥰', '😇', '🤩', '🥳', '😴', '🤔', '🙃', '😺', '🐶', '🐼',
  '🦊', '🐸', '🦄', '🐙', '🐧', '🦋', '🌸', '🌻', '🌙', '⭐', '🔥', '🌈',
  '🍕', '🍩', '☕', '🎧', '🎮', '⚽', '🏀', '🎸', '📚', '🚀', '👻', '💜',
];

const BACKGROUNDS = ['#c1573a', '#f5e3dc', '#fde68a', '#bbf7d0', '#bae6fd', '#c7d2fe', '#f5d0fe', '#fecdd3', '#1f2937', '#ffffff'];

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load that sticker.'));
    img.src = src;
  });
}

// Draws the chosen emoji or sticker on a coloured circle-ready square
async function drawPicture({ kind, value }, background) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);

  if (kind === 'emoji') {
    ctx.font = `${size * 0.56}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(value);
    // Centre the glyph's real ink, not its line box
    const y = size / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    ctx.fillText(value, size / 2, y);
  } else {
    const img = await loadImage(stickerUrl(value));
    const inner = size * 0.74;
    ctx.drawImage(img, (size - inner) / 2, (size - inner) / 2, inner, inner);
  }
  return canvasToFile(canvas, 'image/png');
}

// 😀 Emoji & sticker: pick one and a background colour, and it becomes the picture
function EmojiStickerDialog({ onSave, onClose }) {
  const [tab, setTab] = useState('emoji');
  const [choice, setChoice] = useState({ kind: 'emoji', value: PROFILE_EMOJIS[0] });
  const [background, setBackground] = useState(BACKGROUNDS[1]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setIsSaving(true);
    setError('');
    try {
      await onSave(await drawPicture(choice, background));
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  }

  return (
    <Dialog title="Emoji & sticker" onClose={onClose}>
      <div className="flex shrink-0 justify-center pt-4">
        <span
          className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-line"
          style={{ backgroundColor: background }}
        >
          {choice.kind === 'emoji' ? (
            <span className="text-6xl leading-none" style={{ fontFamily: EMOJI_FONT }}>
              {choice.value}
            </span>
          ) : (
            <img src={stickerUrl(choice.value)} alt="" className="h-[74%] w-[74%]" draggable={false} />
          )}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap justify-center gap-2 px-5 pt-3" role="radiogroup" aria-label="Background colour">
        {BACKGROUNDS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={background === color}
            aria-label={`Background ${color}`}
            onClick={() => setBackground(color)}
            className={`h-7 w-7 rounded-full border border-line transition ${
              background === color ? 'ring-2 ring-brand ring-offset-2 ring-offset-panel' : ''
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <div className="mx-5 mt-4 flex shrink-0 rounded-xl bg-panel-soft p-1 text-sm" role="tablist">
        {[
          ['emoji', 'Emoji'],
          ['sticker', 'Stickers'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg py-1.5 font-medium transition ${tab === key ? 'bg-panel shadow-sm' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {tab === 'emoji' ? (
          <div className="grid grid-cols-6 gap-1">
            {PROFILE_EMOJIS.map((emoji) => (
              <PickButton
                key={emoji}
                selected={choice.kind === 'emoji' && choice.value === emoji}
                onClick={() => setChoice({ kind: 'emoji', value: emoji })}
                label={emoji}
              >
                <span className="text-2xl" style={{ fontFamily: EMOJI_FONT }}>
                  {emoji}
                </span>
              </PickButton>
            ))}
          </div>
        ) : (
          STICKER_PACKS.map((pack) => (
            <div key={pack.id} className="mb-3 last:mb-0">
              <p className="mb-1 text-xs font-medium text-muted">{pack.name}</p>
              <div className="grid grid-cols-4 gap-1">
                {pack.stickers.map((sticker) => (
                  <PickButton
                    key={sticker.id}
                    selected={choice.kind === 'sticker' && choice.value === sticker.id}
                    onClick={() => setChoice({ kind: 'sticker', value: sticker.id })}
                    label={sticker.label}
                  >
                    <img src={stickerUrl(sticker.id)} alt="" className="h-12 w-12" loading="lazy" draggable={false} />
                  </PickButton>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="shrink-0 px-5 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex shrink-0 gap-2 border-t border-line px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:bg-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2 text-sm font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-60"
        >
          {isSaving && <Loader2 size={16} className="animate-spin" />}
          {isSaving ? 'Saving…' : 'Set as profile photo'}
        </button>
      </div>
    </Dialog>
  );
}

function PickButton({ selected, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`flex aspect-square items-center justify-center rounded-xl border transition ${
        selected ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-hover'
      }`}
    >
      {children}
    </button>
  );
}
