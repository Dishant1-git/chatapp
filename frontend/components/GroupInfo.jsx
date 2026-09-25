'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Loader2, Lock, LogOut, Pencil, Shield, UserMinus, UserPlus, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import Avatar, { ChatAvatar } from './Avatar';
import { PeoplePicker } from './NewGroup';
import { checkImageFile } from './ImagePreview';
import { api } from '@/lib/client';
import { isAdmin } from '@/lib/conversations';
import { formatLastSeen } from '@/lib/format';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// Slide-over panel with a group's details. Admins can rename it, change the
// photo, add and remove people and make others admins. Anyone can leave.
export default function GroupInfo({ conversation, onClose }) {
  const { user, updateConversation } = useChat();
  const [view, setView] = useState('info'); // info | add
  const [name, setName] = useState(conversation.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [busy, setBusy] = useState(''); // what is being saved
  const [error, setError] = useState('');
  const [toAdd, setToAdd] = useState([]);

  useEscapeKey(view === 'add' ? () => setView('info') : onClose);

  const myId = user._id;
  const amAdmin = isAdmin(conversation, myId);
  const members = [...conversation.participants].sort((a, b) => {
    // Me first, then admins, then everyone else by name
    const rank = (p) => (p._id === myId ? 0 : isAdmin(conversation, p._id) ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  async function run(label, action) {
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  function saveDetails(formData) {
    return run('details', async () => {
      const { conversation: updated } = await api(`/api/conversations/${conversation._id}`, {
        method: 'PATCH',
        formData,
      });
      updateConversation(conversation._id, { name: updated.name, image: updated.image });
    });
  }

  async function handleNameSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === conversation.name) return setIsEditingName(false);
    const formData = new FormData();
    formData.append('name', trimmed);
    await saveDetails(formData);
    setIsEditingName(false);
  }

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return setError(problem);
    const formData = new FormData();
    formData.append('image', file);
    saveDetails(formData);
  }

  function removeMember(member) {
    if (!window.confirm(`Remove ${member.name} from “${conversation.name}”?`)) return;
    run(`remove:${member._id}`, () =>
      api(`/api/conversations/${conversation._id}/members/${member._id}`, { method: 'DELETE' })
    );
  }

  function makeAdmin(member) {
    run(`admin:${member._id}`, () =>
      api(`/api/conversations/${conversation._id}/admins/${member._id}`, { method: 'POST' })
    );
  }

  function leave() {
    if (!window.confirm(`Leave “${conversation.name}”? You won't get its messages anymore.`)) return;
    // The server then sends "conversation:removed", which closes the chat
    run('leave', () => api(`/api/conversations/${conversation._id}/members/${myId}`, { method: 'DELETE' }));
  }

  function addMembers() {
    run('add', async () => {
      await api(`/api/conversations/${conversation._id}/members`, {
        method: 'POST',
        body: { userIds: toAdd.map((p) => p._id) },
      });
      setToAdd([]);
      setView('info');
    });
  }

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col bg-panel"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-2">
        <button
          onClick={view === 'add' ? () => setView('info') : onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover"
          aria-label="Close"
        >
          <X size={21} />
        </button>
        <h2 className="text-lg font-semibold">{view === 'add' ? 'Add members' : 'Group info'}</h2>
      </header>

      {view === 'add' ? (
        <>
          <PeoplePicker selected={toAdd} onChange={setToAdd} exclude={conversation.participants.map((p) => p._id)} />
          {error && <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              onClick={addMembers}
              disabled={toAdd.length === 0 || busy === 'add'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-40"
            >
              {busy === 'add' ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              Add {toAdd.length || ''} {toAdd.length === 1 ? 'person' : 'people'}
            </button>
          </div>
        </>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-col items-center px-6 pt-8 pb-5 text-center">
            <label className={`group relative rounded-full ${amAdmin ? 'cursor-pointer' : ''}`}>
              <ChatAvatar conversation={conversation} size={112} />
              {amAdmin && (
                <>
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                    {busy === 'details' ? <Loader2 className="animate-spin" /> : <Camera size={24} />}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhoto}
                    disabled={Boolean(busy)}
                    className="sr-only"
                  />
                </>
              )}
            </label>

            {isEditingName ? (
              <form onSubmit={handleNameSubmit} className="mt-4 flex w-full max-w-xs gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-panel-soft px-3 py-2 text-base outline-none focus:border-brand md:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy === 'details' || !name.trim()}
                  className="rounded-xl bg-brand px-4 text-sm font-medium text-on-brand disabled:opacity-50"
                >
                  Save
                </button>
              </form>
            ) : (
              <div className="mt-4 flex items-center gap-1.5">
                <h3 className="text-xl font-semibold">{conversation.name}</h3>
                {amAdmin && (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover"
                    aria-label="Rename group"
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 text-sm text-muted">Group · {conversation.participants.length} members</p>
          </div>

          {error && <p className="mx-5 mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl bg-panel-soft px-3.5 py-3 text-xs text-muted">
            <Lock size={14} className="mt-0.5 shrink-0" />
            Messages are end-to-end encrypted. People added later can't read messages sent before they joined.
          </div>

          <div className="border-t border-line pt-2">
            <p className="px-5 py-2 text-sm font-medium text-muted">{conversation.participants.length} members</p>

            {amAdmin && (
              <button
                onClick={() => setView('add')}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-hover"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-on-brand">
                  <UserPlus size={19} />
                </span>
                <span className="font-medium">Add members</span>
              </button>
            )}

            <ul>
              {members.map((member) => {
                const memberIsAdmin = isAdmin(conversation, member._id);
                const isMe = member._id === myId;
                return (
                  <li key={member._id} className="group flex items-center gap-3 px-5 py-2.5">
                    <Avatar user={member} size={40} showStatus viewable />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{isMe ? 'You' : member.name}</p>
                      {!isMe && (
                        <p className={`truncate text-xs ${member.isOnline ? 'text-brand' : 'text-muted'}`}>
                          {member.isOnline ? 'online' : formatLastSeen(member.lastSeen)}
                        </p>
                      )}
                    </div>
                    {memberIsAdmin && (
                      <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                        Admin
                      </span>
                    )}
                    {amAdmin && !isMe && (
                      <div className="flex shrink-0 items-center">
                        {!memberIsAdmin && (
                          <button
                            onClick={() => makeAdmin(member)}
                            disabled={Boolean(busy)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
                            title="Make admin"
                            aria-label={`Make ${member.name} an admin`}
                          >
                            {busy === `admin:${member._id}` ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
                          </button>
                        )}
                        <button
                          onClick={() => removeMember(member)}
                          disabled={Boolean(busy)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-red-600"
                          title="Remove from group"
                          aria-label={`Remove ${member.name}`}
                        >
                          {busy === `remove:${member._id}` ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <button
            onClick={leave}
            disabled={Boolean(busy)}
            className="mt-2 flex w-full items-center gap-3 border-t border-line px-5 py-4 text-left text-sm font-medium text-red-600 hover:bg-hover disabled:opacity-60 dark:text-red-400"
          >
            {busy === 'leave' ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />} Leave group
          </button>
        </div>
      )}
    </motion.div>
  );
}
