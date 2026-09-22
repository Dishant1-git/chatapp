'use client';

import { useEffect, useState } from 'react';
import { Camera, Loader2, LogOut, Trash2 } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';
import { SidePanel } from './UserSearch';
import { checkImageFile } from './ImagePreview';
import { api } from '@/lib/client';
import { MOODS } from '@/lib/social';

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
            <span className="absolute right-1 bottom-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow md:hidden">
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
              className="rounded-xl bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
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
          <p className="mb-1.5 text-sm font-medium text-brand">Email</p>
          <p className="rounded-xl bg-panel-soft px-3.5 py-2.5 text-sm text-muted">{user.email}</p>
        </div>

        <MoodPicker />
        <SocialStats />

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
