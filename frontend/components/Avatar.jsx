'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { MOODS } from '@/lib/social';
import { openProfileViewer } from './ProfileViewer';

// Profile picture with a fallback to the person's initials
const COLORS = ['#c1573a', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0f766e', '#4f46e5', '#a16207'];

export function colorFor(name = '') {
  let total = 0;
  for (const char of name) total += char.charCodeAt(0);
  return COLORS[total % COLORS.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// viewable: tapping the picture opens it bigger with the person's profile (see ProfileViewer)
export default function Avatar({ user, size = 44, showStatus = false, isGroup = false, viewable = false, onView }) {
  const name = user?.name || '';
  // Remember which image failed, so a new picture gets its own chance to load
  const [brokenImage, setBrokenImage] = useState('');
  const showImage = user?.profileImage && user.profileImage !== brokenImage;

  function view(event) {
    // Avatars often sit inside a link or button (a chat in the list) — don't trigger that too
    event.preventDefault();
    event.stopPropagation();
    (onView || (() => openProfileViewer({ user })))();
  }

  const viewProps = viewable
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `View ${name}'s profile`,
        onClick: view,
        onKeyDown: (event) => (event.key === 'Enter' || event.key === ' ') && view(event),
      }
    : {};

  return (
    <div
      className={`relative shrink-0 ${viewable ? 'cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-brand' : ''}`}
      style={{ width: size, height: size }}
      {...viewProps}
    >
      {showImage ? (
        <img
          src={user.profileImage}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
          onError={() => setBrokenImage(user.profileImage)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white select-none"
          style={{ backgroundColor: colorFor(name), fontSize: size * 0.38 }}
        >
          {isGroup ? <Users size={size * 0.46} /> : initials(name)}
        </div>
      )}

      {showStatus && user?.isOnline && (
        <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-panel bg-emerald-500" />
      )}

      {/* 🎭 Their mood, next to the picture */}
      {showStatus && MOODS[user?.mood] && (
        <span
          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-panel text-[11px] shadow-sm"
          title={MOODS[user.mood].label}
        >
          {MOODS[user.mood].emoji}
        </span>
      )}
    </div>
  );
}

// The picture for a chat: the other person, or the group's photo
export function ChatAvatar({ conversation, size = 44, showStatus = false, viewable = false }) {
  if (conversation?.type === 'group') {
    const group = {
      name: conversation.name,
      image: conversation.image,
      memberCount: conversation.participants?.length || 0,
    };
    return (
      <Avatar
        user={{ name: group.name, profileImage: group.image }}
        size={size}
        isGroup
        viewable={viewable}
        onView={() => openProfileViewer({ group })}
      />
    );
  }
  return <Avatar user={conversation?.otherUser} size={size} showStatus={showStatus} viewable={viewable} />;
}
