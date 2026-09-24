import { MessageCircle } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

// Shared frame for the login and register pages
export default function AuthCard({ title, subtitle, children, footer, icon: Icon = MessageCircle }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <ThemeToggle className="fixed top-3 right-3" />

      {/* The page sits on the teal gradient, so the heading is white and the form is a floating card */}
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center text-white">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-sm ring-1 ring-white/25">
            <Icon size={28} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-white/75">{subtitle}</p>
        </div>

        <div className="rounded-3xl bg-panel p-6 text-fg shadow-xl">{children}</div>

        <p className="mt-6 text-center text-sm text-white/80">{footer}</p>
      </div>
    </main>
  );
}

export function Field({ label, ...inputProps }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        {...inputProps}
        className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 md:text-sm"
      />
    </label>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function SubmitButton({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-xl bg-brand py-2.5 font-medium text-white transition hover:bg-brand-strong disabled:opacity-60"
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
