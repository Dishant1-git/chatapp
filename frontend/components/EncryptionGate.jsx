'use client';

import { useState } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import AuthCard, { Field, FormError, SubmitButton } from './AuthCard';
import { useChat } from './ChatProvider';
import { api } from '@/lib/client';
import { createKeys, unlockKeys } from '@/lib/e2ee';

const MIN_PIN_LENGTH = 6;

// Shown before the chats when this device doesn't have the user's
// encryption key yet: create a PIN (first time) or enter it (new device).
export default function EncryptionGate() {
  const { keyStatus } = useChat();
  const [mode, setMode] = useState(null); // null = follow keyStatus, or 'reset'

  if (mode === 'reset') return <SetupPin isReset onCancel={() => setMode(null)} />;
  if (keyStatus === 'setup') return <SetupPin />;
  return <UnlockPin onForgot={() => setMode('reset')} />;
}

function SetupPin({ isReset = false, onCancel }) {
  const { user, onKeysReady, logout } = useChat();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [understood, setUnderstood] = useState(!isReset);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (pin.length < MIN_PIN_LENGTH) return setError(`Your PIN must be at least ${MIN_PIN_LENGTH} characters.`);
    if (pin !== confirmPin) return setError("The PINs don't match.");
    if (!understood) return setError('Please confirm that you understand what resetting does.');

    setLoading(true);
    try {
      const { body, activate } = await createKeys(user._id, pin);
      const { user: updated } = await api('/api/keys', { method: 'PUT', body: { ...body, reset: isReset } });
      await activate();
      await onKeysReady(updated);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthCard
      icon={isReset ? KeyRound : ShieldCheck}
      title={isReset ? 'Reset your PIN' : 'Protect your messages'}
      subtitle={
        isReset
          ? 'Choose a new PIN for end-to-end encryption'
          : 'Choose a PIN to turn on end-to-end encryption'
      }
      footer={
        isReset ? (
          <button onClick={onCancel} className="font-medium text-brand hover:underline">
            I remember my PIN
          </button>
        ) : (
          <button onClick={logout} className="font-medium text-brand hover:underline">
            Log out
          </button>
        )
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        {isReset ? (
          <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            Resetting creates new encryption keys. Messages sent to you before the reset
            <strong> can no longer be read</strong>, on any device.
          </div>
        ) : (
          <p className="text-sm text-muted">
            Your messages are locked with a key that only your devices have. The PIN protects that key: it never
            leaves this device and Ghosted can't see it. You'll need it when you log in on a new device.
            <strong className="text-fg"> If you forget it, your old messages can't be recovered.</strong>
          </p>
        )}

        <Field
          label="PIN"
          type="password"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder={`At least ${MIN_PIN_LENGTH} characters`}
          required
          autoFocus
        />
        <Field
          label="Confirm PIN"
          type="password"
          autoComplete="new-password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          required
        />
        <p className="text-xs text-muted">
          Use something different from your password. Longer is safer — a short phrase works well.
        </p>

        {isReset && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 accent-[var(--brand)]"
            />
            I understand my old messages will become unreadable.
          </label>
        )}

        <SubmitButton loading={loading}>{isReset ? 'Reset and continue' : 'Turn on encryption'}</SubmitButton>
      </form>
    </AuthCard>
  );
}

function UnlockPin({ onForgot }) {
  const { user, onKeysReady, logout } = useChat();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const backup = await api('/api/keys/backup');
      await unlockKeys(user._id, backup, pin);
      await onKeysReady();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthCard
      icon={LockKeyhole}
      title="Enter your PIN"
      subtitle="Unlock your encrypted messages on this device"
      footer={
        <>
          <button onClick={onForgot} className="font-medium text-brand hover:underline">
            Forgot your PIN?
          </button>
          <span className="mx-2">·</span>
          <button onClick={logout} className="font-medium text-brand hover:underline">
            Log out
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />
        <Field
          label="PIN"
          type="password"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          autoFocus
        />
        <SubmitButton loading={loading}>Unlock</SubmitButton>
      </form>
    </AuthCard>
  );
}
