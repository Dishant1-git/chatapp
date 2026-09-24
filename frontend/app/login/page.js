'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthCard, { Field, FormError, SubmitButton } from '@/components/AuthCard';
import { api } from '@/lib/client';
import { prepareKeys } from '@/lib/accountKeys';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  // Sent here because this device needs the password to unlock encrypted messages
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('unlock') === '1') {
      setNotice('Please log in again to unlock your encrypted messages on this device.');
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      // Unlock (or create) the encryption key with the password — no PIN needed
      await prepareKeys(user, password);
      // Full page load so the chat starts with a fresh socket connection
      window.location.href = '/chat';
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to continue your conversations"
      footer={
        <>
          New here?{' '}
          <Link href="/register" className="font-medium text-white underline-offset-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {notice && !error && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">{notice}</p>}
        <FormError message={error} />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <SubmitButton loading={loading}>Log in</SubmitButton>
      </form>
    </AuthCard>
  );
}
