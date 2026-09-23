'use client';

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Same rules as the backend (backend/utils/storage.js), checked early for instant feedback
export function checkImageFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPG, PNG and WEBP images are allowed.';
  if (file.size > MAX_SIZE) return 'Image is too large. The maximum size is 5 MB.';
  return null;
}

// Opens a chat image in a larger view
export function ImageLightbox({ src, onClose }) {
  useEscapeKey(onClose);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
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
