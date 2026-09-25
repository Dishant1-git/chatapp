'use client';

import { useId, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { passwordRules, passwordStrength } from '@/lib/password';

// Shared frame for the login, sign-up, verification and reset pages.
// greeting: something written by hand above the title (see the login page)
export default function AuthCard({ title, subtitle, children, footer, greeting = null, wide = false }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <ThemeToggle className="fixed top-3 right-3 z-10" />

      {/* Two soft blooms of colour behind everything, so the page isn't flat */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -left-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-28 h-80 w-80 rounded-full bg-brand/10 blur-3xl"
      />

      {/* The page sits on the warm wash, with the form as a floating card */}
      <div className={`relative w-full ${wide ? 'max-w-md' : 'max-w-sm'}`}>
        <div className="mb-6 flex flex-col items-center text-center text-fg">
          <img
            src="/logo-128.webp"
            alt=""
            width={64}
            height={64}
            className="mb-3 h-16 w-16 rounded-[1.15rem] shadow-md"
          />
          {greeting}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <div className="rounded-3xl bg-panel p-6 text-fg shadow-xl ring-1 ring-black/5 dark:ring-white/5">
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </div>
    </main>
  );
}

// hint: something small beside the label (a link, a "free"/"taken" note);
// addon: shown inside the box on the left (e.g. "@"); right: inside on the right.
// The label is tied to the input with an id, so the hint next to it doesn't
// become part of what a screen reader announces for the box.
export function Field({ label, hint, addon, right, error = false, id, ...inputProps }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return (
    <div className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {label}
        </label>
        {hint}
      </div>
      <span className="relative block">
        {addon && (
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted select-none">
            {addon}
          </span>
        )}
        <input
          {...inputProps}
          id={fieldId}
          className={`w-full rounded-xl border bg-panel-soft py-2.5 text-base outline-none transition placeholder:text-muted focus:ring-2 md:text-sm ${
            addon ? 'pl-8' : 'pl-3.5'
          } ${right ? 'pr-11' : 'pr-3.5'} ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-line focus:border-brand focus:ring-brand/20'
          }`}
        />
        {right && <span className="absolute top-1/2 right-1.5 -translate-y-1/2">{right}</span>}
      </span>
    </div>
  );
}

// A password box with a show/hide eye — and, while signing up, a strength bar
// and the checklist of what's still missing.
export function PasswordField({ label = 'Password', value, onChange, showRules = false, about, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const listId = useId();
  const rules = showRules ? passwordRules(value, about) : [];
  const { score, label: strengthLabel } = passwordStrength(value);
  const tone = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'][score];

  return (
    <div>
      <Field
        {...inputProps}
        label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        aria-describedby={showRules ? listId : undefined}
        right={
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-hover hover:text-fg"
            aria-label={visible ? 'Hide password' : 'Show password'}
            title={visible ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        }
      />

      {showRules && value.length > 0 && (
        <div className="mt-2" id={listId}>
          <div className="flex items-center gap-2">
            <span className="flex h-1.5 flex-1 gap-1 overflow-hidden rounded-full">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-full flex-1 rounded-full ${i < score ? tone : 'bg-line'}`} />
              ))}
            </span>
            <span className="w-14 text-right text-xs text-muted">{strengthLabel}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {rules.map((rule) => (
              <li
                key={rule.label}
                className={`flex items-center gap-1.5 text-xs ${rule.ok ? 'text-muted' : 'text-fg'}`}
              >
                {rule.ok ? (
                  <Check size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <X size={13} className="shrink-0 text-muted" />
                )}
                {rule.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FormError({ message, children }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      <p>{message}</p>
      {children}
    </div>
  );
}

export function SubmitButton({ loading, children, disabled = false }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full rounded-xl bg-brand py-2.5 font-medium text-on-brand shadow-sm transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100"
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
