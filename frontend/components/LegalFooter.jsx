import Link from 'next/link';
import { COPYRIGHT_OWNER } from '@/lib/legal';

const LINKS = [
  ['/terms', 'Terms of Service'],
  ['/copyright', 'Copyright'],
  ['/intellectual-property', 'Intellectual Property'],
  ['/cookies', 'Cookie Policy'],
];

// © line and links to the legal pages, under the auth screens, at the foot of
// the profile, and at the bottom of the legal pages themselves
export default function LegalFooter({ className = '' }) {
  return (
    <div className={`text-xs text-muted ${className}`}>
      <p>
        &copy; {new Date().getFullYear()} {COPYRIGHT_OWNER}. All rights reserved.
      </p>
      <p className="mt-1">
        {LINKS.map(([href, label], index) => (
          <span key={href}>
            {index > 0 && ' · '}
            <Link href={href} className="whitespace-nowrap hover:text-brand hover:underline">
              {label}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}
