import ThemeToggle from './ThemeToggle';

// Shared frame for the login and register pages.
// greeting: something written by hand above the title (see the login page)
export default function AuthCard({ title, subtitle, children, footer, greeting = null }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <ThemeToggle className="fixed top-3 right-3" />

      {/* The page sits on the warm wash, with the form as a floating card */}
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center text-fg">
          <img src="/logo.png" alt="" width={56} height={56} className="mb-3 h-14 w-14 rounded-2xl shadow-sm" />
          {greeting}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <div className="rounded-3xl bg-panel p-6 text-fg shadow-xl">{children}</div>

        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
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
      className="w-full rounded-xl bg-brand py-2.5 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-60"
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
