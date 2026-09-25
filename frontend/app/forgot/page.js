'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound, ShieldAlert } from 'lucide-react';
import AuthCard, { Field, PasswordField, FormError, SubmitButton } from '@/components/AuthCard';
import Handwriting from '@/components/Handwriting';
import { api } from '@/lib/client';
import { prepareKeys } from '@/lib/accountKeys';
import { passwordIsValid } from '@/lib/password';

// 🔑 Forgotten password: a code to the same email address, then a new password.
// Step 1 asks for the address, step 2 takes the code and the new password.
export default function ForgotPasswordPage() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendCode(event) {
    event?.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/api/auth/password/forgot', { method: 'POST', body: { email } });
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reset(event) {
    event.preventDefault();
    setError('');
    if (!passwordIsValid(password, { email })) return setError('Please pick a stronger password.');
    if (password !== confirm) return setError('Passwords do not match.');

    setLoading(true);
    try {
      const { user } = await api('/api/auth/password/reset', { method: 'POST', body: { email, code, password } });
      // The old encryption key was locked with the old password, which is gone.
      // prepareKeys notices it can't be opened and sets up a fresh key.
      await prepareKeys(user, password).catch(() => {});
      window.location.href = '/chat';
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (step === 'email') {
    return (
      <AuthCard
        greeting={<Handwriting text="No worries" className="mb-2 text-4xl font-bold text-brand" />}
        title="Forgot your password?"
        subtitle="Tell us your email and we'll send a code"
        footer={
          <Link href="/login" className="font-medium text-brand hover:underline">
            Back to log in
          </Link>
        }
      >
        <form onSubmit={sendCode} className="space-y-4">
          <FormError message={error} />
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <SubmitButton loading={loading}>Send me a code</SubmitButton>
          <p className="text-center text-xs text-muted">
            If there's an account with that address, a six-digit code is on its way to it.
          </p>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      greeting={<Handwriting text="Almost done" className="mb-2 text-4xl font-bold text-brand" />}
      title="Pick a new password"
      subtitle={`Enter the code we sent to ${email}`}
      footer={
        <button type="button" onClick={() => setStep('email')} className="font-medium text-brand hover:underline">
          Use a different email
        </button>
      }
    >
      <form onSubmit={reset} className="space-y-4">
        <FormError message={error} />

        {/* Old messages were locked with the old password, and stay locked */}
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlert size={15} className="mt-px shrink-0" />
          <span>
            Your messages are encrypted with your password, so the ones you already have will stay unreadable
            after a reset. New chats work normally. (If you still know your password, change it from your
            profile instead — that keeps everything.)
          </span>
        </p>

        <Field
          label="Code from the email"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          required
        />

        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showRules
          about={{ email }}
          required
        />

        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        <SubmitButton loading={loading}>
          <span className="inline-flex items-center gap-2">
            <KeyRound size={16} /> Set new password
          </span>
        </SubmitButton>

        <button
          type="button"
          onClick={sendCode}
          disabled={loading}
          className="w-full text-sm font-medium text-brand hover:underline disabled:opacity-60"
        >
          Send a new code
        </button>
      </form>
    </AuthCard>
  );
}
