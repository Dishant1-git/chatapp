import Link from 'next/link';
import { COPYRIGHT_OWNER } from '@/lib/legal';

// © line and a link to the terms, under the auth screens and at the foot of the profile
export default function LegalFooter({ className = '' }) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      &copy; {new Date().getFullYear()} {COPYRIGHT_OWNER}. All rights reserved. ·{' '}
      <Link href="/terms" className="hover:text-brand hover:underline">
        Terms of Service
      </Link>
    </p>
  );
}
