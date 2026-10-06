import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import { COPYRIGHT_OWNER, NOTICES_UPDATED } from '@/lib/legal';

export const metadata = {
  title: 'Copyright Notice · Ghost-ed',
  description: 'Who owns the Ghost-ed code, design, logo, text and graphics, and what you may do with them.',
};

const SECTIONS = [
  ['notice', 'The notice'],
  ['covered', 'What is covered'],
  ['not-allowed', 'What needs our permission'],
  ['allowed', 'What you are free to do'],
  ['not-ours', 'What isn’t ours'],
  ['permission', 'Asking for permission'],
  ['infringement', 'Reporting a copyright problem'],
];

export default function CopyrightPage() {
  const year = new Date().getFullYear();

  return (
    <LegalPage
      title="Copyright Notice"
      updated={NOTICES_UPDATED}
      sections={SECTIONS}
      intro={
        <p>
          Ghost-ed is original work, and a lot of care went into it. This notice sets out who owns it and what that
          means for anyone who would like to reuse a part of it. It sits alongside our{' '}
          <Link href="/terms" className="text-brand hover:underline">
            Terms of Service
          </Link>
          , which remain the agreement between you and us.
        </p>
      }
    >
      <Section id="notice" title="The notice">
        <p className="rounded-2xl bg-panel-soft px-5 py-4 font-medium">
          &copy; {year} {COPYRIGHT_OWNER}. All rights reserved.
        </p>
        <p>
          Everything that makes up Ghost-ed is owned by {COPYRIGHT_OWNER} or licensed to us, and is protected by
          copyright and other laws. No part of it may be copied, reproduced, modified, republished or distributed
          without our written permission, except where this notice or the law says otherwise.
        </p>
      </Section>

      <Section id="covered" title="What is covered">
        <p>This notice applies to the Ghost-ed website and app, including:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>the source code and compiled software, on your device and on our servers;</li>
          <li>the design: layouts, colours, animations, and the overall look and feel;</li>
          <li>the Ghost-ed logo, the ghost mark and the app icons;</li>
          <li>the text, including interface wording, help text and these legal pages;</li>
          <li>graphics, illustrations, built-in stickers, sounds and other media that ship with the app.</li>
        </ul>
      </Section>

      <Section id="not-allowed" title="What needs our permission">
        <p>Unless we have agreed to it in writing, please don&apos;t:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>copy, mirror or republish any part of Ghost-ed, on another site, app or anywhere else;</li>
          <li>reuse our code, design, logo, text or graphics in your own product or service;</li>
          <li>modify, translate or build something derived from Ghost-ed;</li>
          <li>sell, rent, sublicense or otherwise make money from any part of it;</li>
          <li>
            decompile or reverse-engineer the software, except to the extent the law gives you that right regardless;
          </li>
          <li>remove or hide a copyright, trademark or other ownership notice.</li>
        </ul>
      </Section>

      <Section id="allowed" title="What you are free to do">
        <p>
          You are welcome to use Ghost-ed as it is meant to be used, to link to it, and to mention it by name when you
          are talking or writing about it. Nothing here takes away rights the law gives you anyway, such as quoting a
          short passage for review, reporting or teaching.
        </p>
      </Section>

      <Section id="not-ours" title="What isn’t ours">
        <p>
          Your messages, photos, voice and video notes, documents and sticker packs stay yours. We don&apos;t claim
          copyright in anything you create or share on Ghost-ed.
        </p>
        <p>
          Ghost-ed is also built with open-source software and a few outside services. Those remain the property of
          their owners and are used under their own licences. GIFs come from GIPHY and belong to GIPHY or the people
          who made them.
        </p>
      </Section>

      <Section id="permission" title="Asking for permission">
        <p>
          If you would like to use something of ours, for a press piece, a school project or anything else, just ask.
          Reply to any email we have sent you, such as your verification code, and tell us what you would like to use
          and where. We say yes more often than you might think.
        </p>
      </Section>

      <Section id="infringement" title="Reporting a copyright problem">
        <p>
          If you believe something on Ghost-ed copies your work, the Terms of Service explain{' '}
          <Link href="/terms#copyright" className="text-brand hover:underline">
            what to send us and what we can do about it
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
