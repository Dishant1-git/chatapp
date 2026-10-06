import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import { NOTICES_UPDATED } from '@/lib/legal';

export const metadata = {
  title: 'Cookie Policy · Ghost-ed',
  description: 'The one cookie Ghost-ed sets, what else it keeps in your browser, and how to clear it.',
};

const SECTIONS = [
  ['short-version', 'The short version'],
  ['what-they-are', 'What cookies are'],
  ['our-cookie', 'The cookie we set'],
  ['on-your-device', 'Other things kept on your device'],
  ['not-used', 'What we don’t use'],
  ['third-parties', 'Other companies'],
  ['your-choices', 'Your choices'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Getting in touch'],
];

// Keep these two lists in step with the code: the cookie is set in backend/utils/jwt.js,
// and the rest is whatever the frontend puts in localStorage, sessionStorage and IndexedDB.
const COOKIES = [
  [
    'token',
    'Keeps you logged in. It can’t be read by scripts on the page, and it is only sent to Ghost-ed.',
    '7 days, or until you log out',
  ],
];

const STORED = [
  ['theme', 'Whether you picked the light or dark theme.', 'Until you clear it'],
  ['ghosted:accessibility', 'Your accessibility settings.', 'Until you clear it'],
  ['ghosted:privacy', 'Whether the privacy screen is switched on for this device.', 'Until you clear it'],
  ['ghosted:chatTab', 'Which tab of the chat list you had open last.', 'Until you clear it'],
  ['ghosted:tour-done:…', 'That you have already seen the welcome tour, so it isn’t shown again.', 'Until you clear it'],
  ['draft:…', 'A message you have typed but not sent yet, so it isn’t lost if you leave the chat.', 'Until you close the tab'],
  [
    'ghosted (database)',
    'The encryption keys that unlock your messages on this device. They never leave it unprotected.',
    'Until you clear it',
  ],
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated={NOTICES_UPDATED}
      sections={SECTIONS}
      intro={
        <p>
          This page explains what Ghost-ed stores in your browser and why. It is a short list, because we only keep
          what the app needs in order to work.
        </p>
      }
    >
      <Section id="short-version" title="The short version">
        <p>
          Ghost-ed sets one cookie, and its only job is to keep you logged in. We don&apos;t use analytics,
          advertising or tracking cookies, and we don&apos;t follow you around the web.
        </p>
      </Section>

      <Section id="what-they-are" title="What cookies are">
        <p>
          A cookie is a small piece of text that a website asks your browser to hold on to and send back on later
          visits. Browsers have a few similar places to keep things, such as local storage, and since they do much the
          same job we cover those here too.
        </p>
      </Section>

      <Section id="our-cookie" title="The cookie we set">
        <StorageTable rows={COOKIES} />
        <p>
          This cookie is strictly necessary. Without it we would have no way of knowing that you are logged in, so
          there is no switch to turn it off. It is set when you log in or create an account, and removed when you log
          out.
        </p>
      </Section>

      <Section id="on-your-device" title="Other things kept on your device">
        <p>
          These aren&apos;t cookies. They stay in your browser, they are never sent to us automatically, and they are
          there to remember your settings and to keep your messages readable on this device.
        </p>
        <StorageTable rows={STORED} />
        <p>
          If you turn on notifications, your browser also keeps a small background script from us so it can show them
          when Ghost-ed isn&apos;t open. It doesn&apos;t track anything.
        </p>
      </Section>

      <Section id="not-used" title="What we don’t use">
        <ul className="list-disc space-y-1 pl-5">
          <li>No analytics or statistics cookies.</li>
          <li>No advertising cookies, and no ads.</li>
          <li>No social media or cross-site tracking pixels.</li>
          <li>We don&apos;t sell or share anything stored in your browser.</li>
        </ul>
      </Section>

      <Section id="third-parties" title="Other companies">
        <p>
          When you open the GIF picker, the preview images are loaded from GIPHY&apos;s servers. GIPHY can see that
          request and may set cookies of its own, under its own policies. If you never open the GIF picker, nothing is
          loaded from GIPHY.
        </p>
        <p>
          Calls may use public servers to help two devices find each other. Those servers see your network address
          for the length of the call, but they don&apos;t set cookies.
        </p>
      </Section>

      <Section id="your-choices" title="Your choices">
        <p>
          You can remove or block cookies and site data in your browser&apos;s settings at any time. Two things are
          worth knowing before you do:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Removing or blocking the login cookie logs you out, and you can&apos;t stay logged in without it.</li>
          <li>
            Clearing site data also removes the encryption keys from this device. Logging in again with your password
            brings them back, and your settings return to their defaults.
          </li>
        </ul>
        <p>Logging out from your profile removes the login cookie straight away.</p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          If we start storing something new, we will add it to this page and update the date at the top. If we ever
          wanted to use cookies that aren&apos;t strictly necessary, we would ask you first.
        </p>
      </Section>

      <Section id="contact" title="Getting in touch">
        <p>
          Questions about this policy can be sent the same way as anything else: reply to any email we have sent you,
          such as your verification code. Our{' '}
          <Link href="/terms" className="text-brand hover:underline">
            Terms of Service
          </Link>{' '}
          explain what we can and can&apos;t see of your messages.
        </p>
      </Section>
    </LegalPage>
  );
}

// rows: [name, what it is for, how long it is kept]
function StorageTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-panel-soft">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-4 pt-3 pb-2 font-medium">Name</th>
            <th className="px-4 pt-3 pb-2 font-medium">What it is for</th>
            <th className="px-4 pt-3 pb-2 font-medium">Kept for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, purpose, kept]) => (
            <tr key={name} className="border-t border-line align-top">
              <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{name}</td>
              <td className="px-4 py-2.5">{purpose}</td>
              <td className="px-4 py-2.5 text-muted">{kept}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
