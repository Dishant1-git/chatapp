import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import { COPYRIGHT_OWNER, NOTICES_UPDATED } from '@/lib/legal';

export const metadata = {
  title: 'Intellectual Property Notice · Ghost-ed',
  description: 'Our ownership of the Ghost-ed brand, software and other original materials.',
};

const SECTIONS = [
  ['ownership', 'What we own'],
  ['brand', 'The Ghost-ed brand'],
  ['software', 'The software'],
  ['materials', 'Design and original materials'],
  ['licence', 'What you are allowed to do'],
  ['yours', 'What stays yours'],
  ['others', 'Other people’s property'],
  ['protecting', 'Protecting our rights'],
  ['contact', 'Getting in touch'],
];

export default function IntellectualPropertyPage() {
  return (
    <LegalPage
      title="Intellectual Property Notice"
      updated={NOTICES_UPDATED}
      sections={SECTIONS}
      intro={
        <p>
          This notice identifies what belongs to {COPYRIGHT_OWNER}: the brand, the software, and the other original
          work that makes Ghost-ed what it is. It goes together with our{' '}
          <Link href="/copyright" className="text-brand hover:underline">
            Copyright Notice
          </Link>{' '}
          and our{' '}
          <Link href="/terms" className="text-brand hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      }
    >
      <Section id="ownership" title="What we own">
        <p>
          All intellectual property rights in Ghost-ed belong to {COPYRIGHT_OWNER} or to those who license their work
          to us. That includes copyright, trademarks, trade names, design rights, trade secrets and know-how, and
          every other right of that kind, anywhere in the world, whether or not it is registered.
        </p>
      </Section>

      <Section id="brand" title="The Ghost-ed brand">
        <p>
          The name &ldquo;Ghost-ed&rdquo;, the ghost logo, our app icons, and the names of our features are our
          trademarks and brand identifiers. Please don&apos;t:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>use them, or anything confusingly similar, as the name or logo of your own product, company or domain;</li>
          <li>use them in a way that suggests we made, sponsor or endorse something we don&apos;t;</li>
          <li>alter the logo, or use it to mislead people or to run us down unfairly.</li>
        </ul>
        <p>Referring to Ghost-ed by name, honestly and in plain text, is of course fine.</p>
      </Section>

      <Section id="software" title="The software">
        <p>
          The Ghost-ed software is ours: the web app, the servers behind it, the way messages are encrypted and
          delivered, and the way features such as ghosting, streaks and disappearing messages work. It is licensed to
          you for use, not sold, and the parts of it that aren&apos;t public are confidential.
        </p>
      </Section>

      <Section id="materials" title="Design and original materials">
        <p>
          The same goes for the rest of our original work: the visual design and look and feel of the app, its
          animations, illustrations, built-in stickers and sounds, and the text we have written for it, including
          these pages.
        </p>
      </Section>

      <Section id="licence" title="What you are allowed to do">
        <p>
          We give you a personal, non-exclusive, non-transferable and revocable licence to use Ghost-ed as it is meant
          to be used. Using the app doesn&apos;t give you ownership of any of it, and no other licence or right is
          granted, whether by implication or otherwise. Every right we haven&apos;t expressly given you stays with us.
        </p>
      </Section>

      <Section id="yours" title="What stays yours">
        <p>
          Your content is yours. We don&apos;t own your messages, photos, recordings, documents or sticker packs, and
          this notice doesn&apos;t change that. The Terms of Service describe the limited permission we need to store
          and deliver them for you.
        </p>
        <p>
          If you send us ideas or feedback, we may use them to improve Ghost-ed without owing you anything for it. We
          are grateful for them all the same.
        </p>
      </Section>

      <Section id="others" title="Other people’s property">
        <p>
          Names, logos and software that belong to others, such as GIPHY and the open-source projects Ghost-ed is
          built with, remain the property of their owners. Mentioning them here doesn&apos;t mean they endorse us.
        </p>
      </Section>

      <Section id="protecting" title="Protecting our rights">
        <p>
          We would much rather sort things out with a friendly message than a formal one. But if our brand, software
          or other work is used without permission, we may ask for it to be taken down, close the accounts involved,
          and take whatever further steps the law allows.
        </p>
      </Section>

      <Section id="contact" title="Getting in touch">
        <p>
          To ask about using our name, logo or anything else of ours, or to tell us about a misuse you have spotted,
          reply to any email we have sent you, such as your verification code. It will reach a real person on our
          team.
        </p>
      </Section>
    </LegalPage>
  );
}
