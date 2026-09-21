'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SendHorizontal, X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Same rules as the backend (backend/utils/storage.js), checked early for instant feedback
export function checkImageFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPG, PNG and WEBP images are allowed.';
  if (file.size > MAX_SIZE) return 'Image is too large. The maximum size is 5 MB.';
  return null;
}

// Full-screen preview shown after picking an image, before it is sent
export function ImageSendPreview({ file, onCancel, onSend }) {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEscapeKey(onCancel);

  function handleSubmit(event) {
    event.preventDefault();
    onSend(file, caption.trim());
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-noir/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex items-center justify-between p-3 text-cotton">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-cotton/10"
          aria-label="Cancel"
        >
          <X size={24} />
        </button>
        <span className="text-sm text-cotton/70">Send photo</span>
        <span className="w-11" />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {url && <img src={url} alt="Selected" className="max-h-full max-w-full rounded-lg object-contain" />}
      </div>

      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-2xl items-center gap-2 p-3">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption…"
          maxLength={4000}
          autoFocus
          className="min-w-0 flex-1 rounded-full bg-cotton/10 px-4 py-3 text-base text-cotton outline-none placeholder:text-cotton/50 md:text-sm"
        />
        <button
          type="submit"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cta text-on-accent transition hover:bg-cta-strong"
          aria-label="Send photo"
        >
          <SendHorizontal size={20} />
        </button>
      </form>
    </motion.div>
  );
}

// Opens a chat image in a larger view
export function ImageLightbox({ src, onClose }) {
  useEscapeKey(onClose);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-noir/90 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex h-11 w-11 items-center justify-center rounded-full text-cotton hover:bg-cotton/10"
        aria-label="Close"
      >
        <X size={24} />
      </button>
      <motion.img
        src={src}
        alt="Full size"
        className="max-h-full max-w-full rounded-lg object-contain"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
}
