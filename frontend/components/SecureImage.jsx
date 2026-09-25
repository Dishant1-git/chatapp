'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import Skeleton from './Skeleton';
import { decryptImage } from '@/lib/e2ee';

const isEncrypted = (url) => /\.bin$/.test(url || '');

// Resolves a message's image to something <img> can show: the sender's local
// preview, a decrypted copy of an encrypted file, or (older messages) the plain URL.
export function useMessageImage(message) {
  const url = message?.image || '';
  const needsDecrypting = !message?.localImage && isEncrypted(url);
  const [state, setState] = useState({ url: '', src: '', failed: false });

  useEffect(() => {
    if (!needsDecrypting) return;
    let cancelled = false;
    if (!message.contentKey) {
      setState({ url, src: '', failed: true });
      return;
    }
    decryptImage(url, message.contentKey, message.imageType || 'image/webp')
      .then((src) => !cancelled && setState({ url, src, failed: false }))
      .catch(() => !cancelled && setState({ url, src: '', failed: true }));
    return () => {
      cancelled = true;
    };
  }, [url, needsDecrypting, message?.contentKey, message?.imageType]);

  if (message?.localImage) return { src: message.localImage, failed: false };
  if (!needsDecrypting) return { src: url, failed: false };
  // Ignore results that belong to a previous image
  return state.url === url ? { src: state.src, failed: state.failed } : { src: '', failed: false };
}

export default function SecureImage({ message, className = '', onLoad, alt = 'Shared photo' }) {
  const { src, failed } = useMessageImage(message);
  // Reserve the right amount of space while the image loads, so the chat doesn't jump
  const ratio = message.imageWidth && message.imageHeight ? `${message.imageWidth} / ${message.imageHeight}` : undefined;

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center text-muted ${failed ? 'bg-black/5 dark:bg-white/5' : ''} ${className}`}
        style={{ aspectRatio: ratio || '4 / 3' }}
      >
        {failed ? <ImageOff size={22} /> : <Skeleton className="h-full w-full rounded-none" />}
      </div>
    );
  }

  return <img src={src} alt={alt} onLoad={onLoad} className={className} style={{ aspectRatio: ratio }} />;
}
