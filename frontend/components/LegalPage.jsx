import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import LegalFooter from './LegalFooter';

// Shared frame for the terms, copyright, intellectual property and cookie pages.
// sections: [id, title] pairs for the contents list; each one is a <Section> in children.
// These are public pages: the proxy doesn't cover them, so they open with or without an account.
export default function LegalPage({ title, updated, sections, intro, children }) {
  return (
    <main className="relative min-h-dvh overflow-hidden px-4 py-10">
      <ThemeToggle className="fixed top-3 right-3 z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -left-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-2xl">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft size={16} /> Back to Ghost-ed
        </Link>

        <header className="mb-6 flex items-center gap-4 text-fg">
          <img src="/logo-128.webp" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl shadow-md" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-0.5 text-sm text-muted">Last updated {updated}</p>
          </div>
        </header>

        <article className="rounded-3xl bg-panel p-6 text-[15px] leading-relaxed text-fg shadow-xl ring-1 ring-black/5 sm:p-8 dark:ring-white/5">
          {intro}

          <nav aria-label="On this page" className="mt-6 rounded-2xl bg-panel-soft px-5 py-4">
            <p className="mb-2 text-sm font-medium text-brand">On this page</p>
            <ol className="grid list-decimal gap-x-6 gap-y-1 pl-5 text-sm text-muted sm:grid-cols-2">
              {sections.map(([id, sectionTitle]) => (
                <li key={id}>
                  <a href={`#${id}`} className="hover:text-brand hover:underline">
                    {sectionTitle}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {children}
        </article>

        <LegalFooter className="mt-6 text-center" />
      </div>
    </main>
  );
}

export function Section({ id, title, children }) {
  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-brand">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
