'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera } from 'lucide-react';
import AuthCard, { Field, FormError, SubmitButton } from '@/components/AuthCard';
import { api } from '@/lib/client';
import { checkImageFile } from '@/components/ImagePreview';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Free the preview URL when the image changes or the page closes
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
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
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.append(key, value));
    if (image) formData.append('profileImage', image);

    setLoading(true);
    try {
      await api('/api/auth/register', { method: 'POST', formData });
      window.location.href = '/chat';
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthCard
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
        <FormError message={error} />

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
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={updateField}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={updateField}
          required
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={updateField}
          required
        />
        <SubmitButton loading={loading}>Create account</SubmitButton>
      </form>
    </AuthCard>
  );
}
