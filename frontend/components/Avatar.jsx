// Profile picture with a fallback to the person's initials
const COLORS = ['#0d8a74', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#65a30d'];

function colorFor(name = '') {
  let total = 0;
  for (const char of name) total += char.charCodeAt(0);
  return COLORS[total % COLORS.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function Avatar({ user, size = 44, showStatus = false }) {
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
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white select-none"
          style={{ backgroundColor: colorFor(name), fontSize: size * 0.38 }}
        >
          {initials(name)}
        </div>
      )}

      {showStatus && user?.isOnline && (
        <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-panel bg-emerald-500" />
      )}
    </div>
  );
}
