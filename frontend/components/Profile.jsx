'use client';

import { useEffect, useState } from 'react';
import { Camera, Check, Eye, EyeOff, KeyRound, Loader2, LogOut, Trash2 } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';
import { SidePanel } from './UserSearch';
import { checkImageFile } from './ImagePreview';
import { api } from '@/lib/client';
import { moveKeysToNewPassword } from '@/lib/accountKeys';
import { passwordIsValid, passwordRules } from '@/lib/password';
import { privacyOn, setPrivacy } from '@/lib/privacy';
import { MOODS } from '@/lib/social';
import { FONT_SIZES, TEXT_COLORS, loadAccessibility, saveAccessibility, speak } from '@/lib/accessibility';

export default function Profile({ onClose }) {
  const { user, setUser, logout } = useChat();
  const [name, setName] = useState(user.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  async function saveProfile(formData) {
    const { user: updated } = await api('/api/users/me', { method: 'PATCH', formData });
    setUser(updated);
  }

  async function handleNameSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === user.name) return;

    setIsSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('name', trimmed);
      await saveProfile(formData);
      setMessage({ type: 'success', text: 'Name updated.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const problem = checkImageFile(file);
    if (problem) return setMessage({ type: 'error', text: problem });

    setIsUploading(true);
    setMessage({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('profileImage', file);
      await saveProfile(formData);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveImage() {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('removeImage', 'true');
      await saveProfile(formData);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <SidePanel title="Profile" onClose={onClose}>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-col items-center px-6 pt-8 pb-6">
          <label className="group relative cursor-pointer rounded-full" title="Change profile picture">
            <Avatar user={user} size={128} />
            <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
              {isUploading ? <Loader2 className="animate-spin" /> : <Camera size={24} />}
              <span className="mt-1">Change photo</span>
            </span>
            {/* Always visible on touch screens, where there is no hover */}
            <span className="absolute right-1 bottom-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-on-brand shadow md:hidden">
              <Camera size={17} />
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              disabled={isUploading}
              className="sr-only"
            />
          </label>

          {user.profileImage && (
            <button
              onClick={handleRemoveImage}
              disabled={isUploading}
              className="mt-3 flex items-center gap-1.5 text-sm text-muted hover:text-red-600"
            >
              <Trash2 size={14} /> Remove photo
            </button>
          )}
        </div>

        <form onSubmit={handleNameSubmit} className="px-5">
          <label className="mb-1.5 block text-sm font-medium text-brand">Your name</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className="min-w-0 flex-1 rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
            />
            <button
              type="submit"
              disabled={isSaving || name.trim() === user.name || name.trim().length < 2}
              className="rounded-xl bg-brand px-4 text-sm font-medium text-on-brand hover:bg-brand-strong disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>

        {message.text && (
          <p
            className={`mx-5 mt-3 text-sm ${message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-brand'}`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-6 px-5">
          {user.username && (
            <>
              <p className="mb-1.5 text-sm font-medium text-brand">Username</p>
              <p className="mb-4 rounded-xl bg-panel-soft px-3.5 py-2.5 text-sm text-muted">
                @{user.username}
                <span className="block text-xs">People can find you with this</span>
              </p>
            </>
          )}
          <p className="mb-1.5 text-sm font-medium text-brand">Email</p>
          <p className="rounded-xl bg-panel-soft px-3.5 py-2.5 text-sm text-muted">{user.email}</p>
        </div>

        <ChangePassword />

        <PrivacyScreen />
        <MoodPicker />
        <SocialStats />
        <AccessibilitySettings />

        <div className="mt-6 border-t border-line">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm">Appearance</span>
            <ThemeToggle />
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium text-red-600 hover:bg-hover dark:text-red-400"
          >
            <LogOut size={18} /> Log out
          </button>
        </div>
      </div>
    </SidePanel>
  );
}

// 🎭 Mood: shown next to my name instead of a plain "online"
function MoodPicker() {
  const { user, setUser } = useChat();
  const [saving, setSaving] = useState(null);

  async function choose(mood) {
    const next = user.mood === mood ? '' : mood;
    setSaving(mood);
    try {
      const { user: updated } = await api('/api/users/me', { method: 'PATCH', body: { mood: next } });
      setUser(updated);
    } catch {
      // Keep the old mood; nothing else to do
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-6 px-5">
      <p className="mb-1.5 text-sm font-medium text-brand">Mood</p>
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(MOODS).map(([key, mood]) => (
          <button
            key={key}
            onClick={() => choose(key)}
            disabled={Boolean(saving)}
            aria-pressed={user.mood === key}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-60 ${
              user.mood === key ? 'border-brand bg-brand-soft' : 'border-line hover:bg-hover'
            }`}
          >
            <span className="text-lg">{mood.emoji}</span>
            <span className="truncate">{mood.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">People you chat with see it next to your name. Tap again to clear.</p>
    </div>
  );
}

// 📊 A private "ghost score" — only I ever see these numbers
function SocialStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api('/api/auth/me')
      .then(({ user }) => setStats(user.stats || {}))
      .catch(() => {});
  }, []);

  const rows = [
    ['👻', 'You ghosted', stats?.ghosted, 'conversations'],
    ['🕊️', 'You forgave', stats?.forgave, 'people'],
    ['💌', 'Apologies sent', stats?.apologies, ''],
    ['🔥', 'Chats revived', stats?.revived, ''],
  ];

  return (
    <div className="mt-6 px-5">
      <p className="mb-1.5 text-sm font-medium text-brand">Your social life</p>
      <div className="grid grid-cols-2 gap-1.5">
        {rows.map(([emoji, label, value, unit]) => (
          <div key={label} className="rounded-xl bg-panel-soft px-3 py-2">
            <p className="text-lg font-semibold">
              {emoji} {value ?? '–'}
            </p>
            <p className="text-xs text-muted">
              {label} {unit}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">🔒 Only you can see this.</p>
    </div>
  );
}

// ♿ Accessibility: text size, text colour and reading messages aloud (saved on this device)
function AccessibilitySettings() {
  const [settings, setSettings] = useState(loadAccessibility);

  function update(changes) {
    const next = { ...settings, ...changes };
    setSettings(next);
    saveAccessibility(next);
  }

  return (
    <div className="mt-6 px-5">
      <p className="mb-1.5 text-sm font-medium text-brand">Accessibility</p>

      <p className="mb-1 text-xs text-muted">Text size</p>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Text size">
        {FONT_SIZES.map((size) => (
          <button
            key={size.value}
            role="radio"
            aria-checked={settings.fontScale === size.value}
            aria-label={size.label}
            title={size.label}
            onClick={() => update({ fontScale: size.value })}
            className={`rounded-xl border py-2 font-semibold transition ${
              settings.fontScale === size.value ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:bg-hover'
            }`}
            style={{ fontSize: `${14 * size.value}px` }}
          >
            A
          </button>
        ))}
      </div>

      <p className="mt-3 mb-1 text-xs text-muted">Text colour</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Text colour">
        {TEXT_COLORS.map((color) => (
          <button
            key={color.value}
            role="radio"
            aria-checked={settings.textColor === color.value}
            aria-label={color.label}
            title={color.label}
            onClick={() => update({ textColor: color.value })}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              settings.textColor === color.value ? 'border-brand bg-brand-soft' : 'border-line hover:bg-hover'
            }`}
          >
            <span className="h-3.5 w-3.5 rounded-full border border-line" style={{ backgroundColor: color.swatch }} />
            {color.label}
          </button>
        ))}
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-panel-soft px-3.5 py-2.5 text-sm">
        <span>
          🔊 Read new messages aloud
          <span className="block text-xs text-muted">Or long-press any message → Read aloud</span>
        </span>
        <input
          type="checkbox"
          checked={settings.readAloud}
          onChange={(e) => update({ readAloud: e.target.checked })}
          className="h-5 w-5 shrink-0 accent-[var(--brand)]"
        />
      </label>
      <button
        onClick={() => speak('This is how messages will sound when they are read aloud.')}
        className="mt-2 text-sm font-medium text-brand hover:underline"
      >
        ▶ Test the voice
      </button>
    </div>
  );
}

// 🔑 Changing the password from inside the app. Because the current password is
// known here, the encryption key is simply locked again with the new one — so
// unlike a reset from the login page, nothing becomes unreadable.
function ChangePassword() {
  const { user } = useChat();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  async function save(event) {
    event.preventDefault();
    setMessage({ type: '', text: '' });

    if (!passwordIsValid(next, user)) {
      return setMessage({ type: 'error', text: 'Please pick a stronger password.' });
    }

    setBusy(true);
    try {
      await api('/api/auth/password/change', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      // Move the encryption key across, so older messages stay readable
      await moveKeysToNewPassword(user, current, next);
      setMessage({ type: 'ok', text: 'Password changed. Your messages are still readable.' });
      setCurrent('');
      setNext('');
      setOpen(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 px-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium transition hover:bg-hover"
        >
          <KeyRound size={16} className="text-brand" /> Change password
        </button>
      ) : (
        <form onSubmit={save} className="space-y-2.5 rounded-xl border border-line p-3.5">
          <p className="text-sm font-medium">Change password</p>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className="w-full rounded-lg border border-line bg-panel-soft px-3 py-2 text-base outline-none focus:border-brand md:text-sm"
            required
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            className="w-full rounded-lg border border-line bg-panel-soft px-3 py-2 text-base outline-none focus:border-brand md:text-sm"
            required
          />
          {next.length > 0 && (
            <ul className="space-y-0.5">
              {passwordRules(next, user).map((rule) => (
                <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.ok ? 'text-muted' : 'text-fg'}`}>
                  <Check size={12} className={rule.ok ? 'text-emerald-600 dark:text-emerald-400' : 'opacity-30'} />
                  {rule.label}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-brand py-2 text-sm font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:bg-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {message.text && (
        <p className={`mt-2 text-sm ${message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-brand'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

// 🫣 Privacy screen: blurs messages so the person next to you can't read them.
// Hovering (or tapping) one shows it, and only it.
function PrivacyScreen() {
  const [on, setOn] = useState(false);

  // The class is put on <html> before the page paints (lib/privacy.js), so read
  // the current state after mounting rather than guessing it
  useEffect(() => setOn(privacyOn()), []);

  function toggle() {
    const next = !on;
    setPrivacy(next);
    setOn(next);
  }

  return (
    <div className="mt-6 border-t border-line px-5 pt-4">
      <p className="mb-1.5 text-sm font-medium text-brand">Privacy screen</p>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className="flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-left transition hover:bg-hover"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${on ? 'bg-brand text-on-brand' : 'bg-panel-soft text-muted'}`}>
          {on ? <EyeOff size={18} /> : <Eye size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{on ? 'On' : 'Off'}</span>
          <span className="block text-xs text-muted">
            Blurs messages, photos and previews. Hover or tap one to read it.
          </span>
        </span>
        <span
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-brand' : 'bg-line'}`}
          aria-hidden
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-panel transition-all ${on ? 'left-6' : 'left-1'}`}
          />
        </span>
      </button>
      <p className="mt-1.5 text-xs text-muted">Kept on this device only — it doesn’t follow you to another one.</p>
    </div>
  );
}
