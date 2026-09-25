'use client';

import { useEffect, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';
import AuthCard, { FormError, SubmitButton } from '@/components/AuthCard';
import Handwriting from '@/components/Handwriting';
import { api, logoutAndRedirect } from '@/lib/client';

const CODE_LENGTH = 6;

// ✉️ The code from the sign-up email. The account exists already, but nothing
// else in the app opens until the address behind it has been confirmed.
export default function VerifyPage() {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const boxRef = useRef(null);

  // Already verified (or logged out) people don't belong here
  useEffect(() => {
    api('/api/auth/me')
      .then(({ user }) => {
        if (user.emailVerified) window.location.href = '/chat';
        else setEmail(user.email);
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  // typed: the digits to send. The last keystroke passes them in, because the
  // state behind `code` hasn't been re-rendered yet at that point.
  async function submit(event, typed = code) {
    event?.preventDefault();
    if (typed.length !== CODE_LENGTH || loading) return;

    setError('');
    setLoading(true);
    try {
      await api('/api/auth/verify', { method: 'POST', body: { code: typed } });
      window.location.href = '/chat';
    } catch (err) {
      setError(err.message);
      setCode('');
      setLoading(false);
      boxRef.current?.focus();
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    setResending(true);
    try {
      const { email: sentTo } = await api('/api/auth/verify/resend', { method: 'POST' });
      setNotice(`A new code is on its way to ${sentTo || email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  // Typing the last digit sends it, like a phone does
  function handleChange(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) setTimeout(() => submit(null, digits), 0);
  }

  return (
    <AuthCard
      greeting={<Handwriting text="One more thing" className="mb-2 text-4xl font-bold text-brand" />}
      title="Check your email"
      subtitle={email ? `We sent a six-digit code to ${email}` : 'We sent you a six-digit code'}
      footer={
        <button type="button" onClick={() => logoutAndRedirect()} className="font-medium text-brand hover:underline">
          Use a different account
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {notice && !error && (
          <p className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
            <MailCheck size={16} className="shrink-0" /> {notice}
          </p>
        )}
        <FormError message={error} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Verification code</span>
          <input
            ref={boxRef}
            value={code}
            onChange={handleChange}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            placeholder="123456"
            aria-label="Verification code"
            className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-3 text-center text-2xl font-semibold tracking-[0.5em] outline-none transition placeholder:text-muted placeholder:tracking-[0.4em] focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        <SubmitButton loading={loading}>Verify my email</SubmitButton>

        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="w-full text-sm font-medium text-brand hover:underline disabled:opacity-60"
        >
          {resending ? 'Sending…' : 'Send a new code'}
        </button>
        <p className="text-center text-xs text-muted">
          The code works for 15 minutes. Have a look in your spam folder if it isn’t there.
        </p>
      </form>
    </AuthCard>
  );
}
