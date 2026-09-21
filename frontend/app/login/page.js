'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthCard, { Field, FormError, SubmitButton } from '@/components/AuthCard';
import { api } from '@/lib/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
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
          <Link href="/register" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
