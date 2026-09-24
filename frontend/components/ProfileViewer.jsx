'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, Users, X } from 'lucide-react';
import Avatar from './Avatar';
import { ImageLightbox } from './ImagePreview';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { formatLastSeen } from '@/lib/format';
import { MOODS } from '@/lib/social';

// Tap anyone's picture → a big version of it with their profile underneath.
// Any component can open it with openProfileViewer(); <ProfileViewer /> is mounted once in the chat layout.
const listeners = new Set();

// profile: { user } for a person, or { group: { name, image, memberCount } }
export function openProfileViewer(profile) {
  listeners.forEach((listener) => listener(profile));
}

export default function ProfileViewer() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    listeners.add(setProfile);
    return () => listeners.delete(setProfile);
  }, []);

  return <AnimatePresence>{profile && <ProfileCard profile={profile} onClose={() => setProfile(null)} />}</AnimatePresence>;
}

function ProfileCard({ profile, onClose }) {
  const [showFullImage, setShowFullImage] = useState(false);
  const closeCard = useCallback(() => !showFullImage && onClose(), [showFullImage, onClose]);
  useEscapeKey(closeCard);

  const { user, group } = profile;
  const person = user || { name: group.name, profileImage: group.image };
  const mood = user && MOODS[user.mood];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name}'s profile`}
    >
      <motion.div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-panel shadow-xl"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {person.profileImage ? (
          <button
            type="button"
            onClick={() => setShowFullImage(true)}
            className="block aspect-square w-full bg-black/5"
            aria-label="View full photo"
          >
            <img src={person.profileImage} alt={person.name} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-panel-soft">
            <Avatar user={person} size={180} isGroup={Boolean(group)} />
          </div>
        )}

        <div className="px-5 py-4">
          <h2 className="truncate text-xl font-semibold">{person.name}</h2>

          {user && (
            <p className={`mt-0.5 text-sm ${user.isOnline ? 'text-brand' : 'text-muted'}`}>
              {user.isOnline ? 'online' : formatLastSeen(user.lastSeen)}
            </p>
          )}
          {group && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <Users size={14} /> Group · {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
            </p>
          )}

          {mood && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-panel-soft px-3 py-1 text-sm">
              <span>{mood.emoji}</span> {mood.label}
            </p>
          )}
          {user?.email && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Mail size={15} className="shrink-0" /> <span className="truncate">{user.email}</span>
            </p>
          )}
        </div>
      </motion.div>

      {/* Clicks inside the full-size photo shouldn't also close the profile behind it */}
      <div onClick={(e) => e.stopPropagation()}>
        <AnimatePresence>
          {showFullImage && <ImageLightbox src={person.profileImage} onClose={() => setShowFullImage(false)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
