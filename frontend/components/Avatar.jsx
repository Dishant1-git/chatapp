import { Users } from 'lucide-react';

// Profile picture with a fallback to the person's initials
// Shades of the palette (cherry, maroon and mixes of them with noir and cotton).
// Plain noir is left out: it would disappear on the dark theme.
const COLORS = ['#810100', '#630000', '#9c3b34', '#5a574e', '#7a2e27', '#4a3a36'];

export function colorFor(name = '') {
  let total = 0;
  for (const char of name) total += char.charCodeAt(0);
  return COLORS[total % COLORS.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function Avatar({ user, size = 44, showStatus = false, isGroup = false }) {
  const name = user?.name || '';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {user?.profileImage ? (
        <img
          src={user.profileImage}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-cotton select-none"
          style={{ backgroundColor: colorFor(name), fontSize: size * 0.38 }}
        >
          {isGroup ? <Users size={size * 0.46} /> : initials(name)}
        </div>
      )}

      {showStatus && user?.isOnline && (
        <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-panel bg-emerald-500" />
      )}
    </div>
  );
}

// The picture for a chat: the other person, or the group's photo
export function ChatAvatar({ conversation, size = 44, showStatus = false }) {
  if (conversation?.type === 'group') {
    return <Avatar user={{ name: conversation.name, profileImage: conversation.image }} size={size} isGroup />;
  }
  return <Avatar user={conversation?.otherUser} size={size} showStatus={showStatus} />;
}
