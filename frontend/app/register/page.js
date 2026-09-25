'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera, Check, Loader2, X } from 'lucide-react';
import AuthCard, { Field, PasswordField, FormError, SubmitButton } from '@/components/AuthCard';
import Handwriting from '@/components/Handwriting';
import { api } from '@/lib/client';
import { prepareKeys } from '@/lib/accountKeys';
import { checkImageFile } from '@/components/ImagePreview';
import { passwordIsValid } from '@/lib/password';

// How long to wait after the last keystroke before asking whether a username is free
const CHECK_DELAY_MS = 400;

// "Dishant Patel" → "dishantpatel": a starting point they can change
function handleFromName(name) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^[0-9]+/, '').slice(0, 16);
  return base.length >= 3 ? base : base;
}

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '' });
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 🏷️ What the server says about the username being typed
  const [handle, setHandle] = useState({ state: 'idle', problem: '', suggestions: [] });
  // Until they edit it themselves, the username follows the name they type
  const [pickedOwnHandle, setPickedOwnHandle] = useState(false);

  // Free the preview URL when the image changes or the page closes
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // Ask whether the username is free, a moment after they stop typing
  useEffect(() => {
    const username = form.username.trim().toLowerCase();
    if (!username) {
      setHandle({ state: 'idle', problem: '', suggestions: [] });
      return;
    }

    let cancelled = false;
    setHandle((prev) => ({ ...prev, state: 'checking' }));
    const timer = setTimeout(async () => {
      try {
        const result = await api(`/api/auth/username?u=${encodeURIComponent(username)}`);
        if (cancelled) return; // they typed something else in the meantime
        // A handle we filled in ourselves shouldn't stop them: if it's taken,
        // quietly move to the next free one
        if (!result.available && !pickedOwnHandle && result.suggestions?.length) {
          setForm((current) => ({ ...current, username: result.suggestions[0] }));
          return;
        }
        setHandle({
          state: result.available ? 'free' : 'taken',
          problem: result.problem || '',
          suggestions: result.suggestions || [],
        });
      } catch {
        if (!cancelled) setHandle({ state: 'idle', problem: '', suggestions: [] });
      }
    }, CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.username, pickedOwnHandle]);

  function updateField(event) {
    const { name, value } = event.target;
    if (name === 'username') {
      // Usernames are always lower case, with no spaces or punctuation
      setPickedOwnHandle(true);
      return setForm({ ...form, username: value.toLowerCase().replace(/[^a-z0-9_]/g, '') });
    }
    // Typing a name fills in a matching handle, until they change it themselves
    if (name === 'name' && !pickedOwnHandle) {
      return setForm({ ...form, name: value, username: handleFromName(value) });
    }
    setForm({ ...form, [name]: value });
  }

  function handleImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const problem = checkImageFile(file);
    if (problem) return setError(problem);
    setError('');
    setImage(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    // Quick checks here for instant feedback; the server checks everything again
    if (!passwordIsValid(form.password, form)) return setError('Please pick a stronger password.');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.append(key, value));
    if (image) formData.append('profileImage', image);

    setLoading(true);
    try {
      let { user } = await api('/api/auth/register', { method: 'POST', formData }).catch(async (err) => {
        // The handle we filled in was taken a moment ago: take a free one and
        // carry on, rather than stopping them over a name they never chose
        if (err.code === 'USERNAME_TAKEN' && !pickedOwnHandle && err.data?.suggestions?.length) {
          const free = err.data.suggestions[0];
          setForm((current) => ({ ...current, username: free }));
          formData.set('username', free);
          return api('/api/auth/register', { method: 'POST', formData });
        }
        throw err;
      });
      // Encryption is on from the start: the key is created and locked with the password.
      // (If that fails, the account still exists — the next login finishes it.)
      await prepareKeys(user, form.password).catch(() => {});
      // ✉️ The account is made, but the code from the email comes first
      window.location.href = user.emailVerified ? '/chat' : '/verify';
    } catch (err) {
      setError(err.message);
      // 🏷️ Someone took the username in the meantime: offer the free ones
      if (err.code === 'USERNAME_TAKEN') {
        setHandle({ state: 'taken', problem: '', suggestions: err.data?.suggestions || [] });
      }
      setLoading(false);
    }
  }

  const typedHandle = form.username.trim();
  const showSuggestions = handle.state === 'taken' && handle.suggestions.length > 0;

  return (
    <AuthCard
      greeting={<Handwriting text="Come on in" className="mb-2 text-4xl font-bold text-brand" />}
      title="Create your account"
      subtitle="It only takes a minute"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error}>
          {error.includes('email already exists') && (
            <p className="mt-1">
              <Link href="/login" className="font-medium underline">
                Log in instead
              </Link>{' '}
              ·{' '}
              <Link href="/forgot" className="font-medium underline">
                Forgot your password?
              </Link>
            </p>
          )}
        </FormError>

        <div className="flex justify-center">
          <label className="group relative cursor-pointer" title="Add a profile picture (optional)">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-panel-soft text-muted transition group-hover:border-brand">
              {imageUrl ? (
                <img src={imageUrl} alt="Profile preview" className="h-full w-full object-cover" />
              ) : (
                <Camera size={24} />
              )}
            </div>
            <span className="mt-1 block text-center text-xs text-muted">
              {image ? 'Change photo' : 'Add photo'}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImage}
              className="sr-only"
            />
          </label>
        </div>

        <Field label="Name" name="name" autoComplete="name" value={form.name} onChange={updateField} required />

        {/* 🏷️ The handle people can find them by */}
        <div>
          <Field
            label="Username"
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={updateField}
            addon="@"
            minLength={3}
            maxLength={20}
            required
            error={handle.state === 'taken' || Boolean(handle.problem)}
            hint={
              typedHandle.length > 0 ? (
                <span className="flex items-center gap-1 text-xs">
                  {handle.state === 'checking' && <Loader2 size={12} className="animate-spin text-muted" />}
                  {handle.state === 'free' && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Check size={12} /> free
                    </span>
                  )}
                  {handle.state === 'taken' && (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <X size={12} /> taken
                    </span>
                  )}
                </span>
              ) : null
            }
          />
          {handle.problem && <p className="mt-1 text-xs text-muted">{handle.problem}</p>}
          {showSuggestions && (
            <div className="mt-2">
              <p className="text-xs text-muted">How about:</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {handle.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setPickedOwnHandle(true);
                      setForm((current) => ({ ...current, username: suggestion }));
                    }}
                    className="rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand transition hover:bg-hover"
                  >
                    @{suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={updateField}
          required
        />

        <PasswordField
          name="password"
          autoComplete="new-password"
          value={form.password}
          onChange={updateField}
          showRules
          about={form}
          required
        />

        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={updateField}
          required
        />

        <SubmitButton loading={loading} disabled={handle.state === 'taken'}>
          Create account
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
