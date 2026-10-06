import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import { COPYRIGHT_OWNER, TERMS_UPDATED } from '@/lib/legal';

export const metadata = {
  title: 'Terms of Service · Ghost-ed',
  description: 'The terms for using Ghost-ed, and who owns what.',
};

// The contents list at the top, and the id each section is linked by
const SECTIONS = [
  ['short-version', 'The short version'],
  ['who-can-use', 'Who can use Ghost-ed'],
  ['your-account', 'Your account'],
  ['your-content', 'Your messages and what we can see'],
  ['behaviour', 'How we ask you to behave'],
  ['features', 'Ghosting, disappearing messages and calls'],
  ['third-parties', 'Services we rely on'],
  ['copyright', 'Copyright and intellectual property'],
  ['ending', 'Suspending or closing an account'],
  ['as-is', 'The service as it is'],
  ['liability', 'Limits on our liability'],
  ['changes', 'Changes to these terms'],
  ['contact', 'Getting in touch'],
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={TERMS_UPDATED}
      sections={SECTIONS}
      intro={
        <p>
          Thanks for choosing Ghost-ed. These terms are the agreement between you and us, the people who build and
          run it. We have tried to write them the way we would explain things to a friend: plainly, and without
          burying anything important. By creating an account or using the app, you agree to them. If something
          here doesn&apos;t sit right with you, please don&apos;t use Ghost-ed, and do tell us why.
        </p>
      }
    >
      <Section id="short-version" title="The short version">
        <p>
          The full terms below are what count, but here is the gist. Your messages belong to you, and they are
          locked on your device before they ever reach us, so we can&apos;t read them. Be decent to the people
          you talk to. Don&apos;t use Ghost-ed to hurt anyone or to break the law. Keep your password safe,
          because it is the only key to your encrypted history and we have no way to get it back for you. The
          Ghost-ed name, logo and design are ours; please don&apos;t copy them.
        </p>
      </Section>

      <Section id="who-can-use" title="Who can use Ghost-ed">
        <p>
          You need to be at least 13 years old, or older if the law where you live sets a higher age for using
          services like this one. If you are under the age of adulthood where you live, please make sure a parent
          or guardian has read these terms and is comfortable with you using the app.
        </p>
        <p>
          You also need to be allowed to use the service under the laws that apply to you, and you can&apos;t
          use Ghost-ed if we have previously closed your account for breaking these terms.
        </p>
      </Section>

      <Section id="your-account" title="Your account">
        <p>
          When you sign up, we ask for your name, a username, your email address and a password. Please give us
          details that are genuinely yours. Your username is how other people find you, so pick one that
          doesn&apos;t pretend to be someone else or infringe on anyone&apos;s trademark. We may ask you to change
          a username that does.
        </p>
        <p>
          You are responsible for what happens under your account, so keep your password to yourself. One thing
          is worth saying clearly: your password also unlocks the encryption key that protects your messages. If
          you forget it and reset it, you will be able to log in again, but messages sent before the reset can no
          longer be opened. That is not a bug. It is the price of a design where we never hold your keys.
        </p>
        <p>
          If you think someone else has got into your account, change your password straight away and let us
          know.
        </p>
      </Section>

      <Section id="your-content" title="Your messages and what we can see">
        <p>
          Everything you create on Ghost-ed, including your messages, photos, voice and video notes, documents and
          sticker packs, stays yours. We don&apos;t claim ownership of any of it.
        </p>
        <p>
          Messages and attachments are end-to-end encrypted in your browser before they are sent. Our servers
          store and pass along locked data that only the people in the conversation can open. To make the app work
          at all, we do see some things that aren&apos;t encrypted:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>who you talk to, and when;</li>
          <li>the type and size of a message, and delivery, read and reaction status;</li>
          <li>your profile details and photo, group names and photos, and chat backgrounds;</li>
          <li>
            emoji-only messages sent by someone you have ghosted, because we have to check that they really are
            only emojis.
          </li>
        </ul>
        <p>
          So that we can store and deliver your content, you give us a limited, worldwide, royalty-free permission
          to host, copy and transmit it, only as far as that is needed to run Ghost-ed for you. That permission
          ends when the content is deleted from our systems, except for copies that other people in the
          conversation already have.
        </p>
        <p>
          You are responsible for what you share, and you confirm that you have the right to share it. Because we
          can&apos;t read encrypted content, we rely on you, and on people telling us when something is wrong,
          to keep Ghost-ed a good place to be.
        </p>
      </Section>

      <Section id="behaviour" title="How we ask you to behave">
        <p>Ghost-ed only works if people feel safe on it. Please don&apos;t use it to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>harass, threaten, bully, stalk or intimidate anyone;</li>
          <li>share sexual content involving minors, or any content that exploits or endangers children;</li>
          <li>share intimate images of someone without their consent;</li>
          <li>promote violence or terrorism, or organise anything illegal;</li>
          <li>send spam, scams, phishing links or malware;</li>
          <li>pretend to be another person or organisation;</li>
          <li>share material that infringes someone else&apos;s copyright, trademark or privacy;</li>
          <li>
            probe, overload or interfere with our servers, get around rate limits or security measures, or access
            accounts or data that aren&apos;t yours;
          </li>
          <li>collect other people&apos;s information through automated means, or resell access to the service.</li>
        </ul>
        <p>
          If someone is making you uncomfortable, you can ghost them, leave the conversation, or{' '}
          <a href="#contact" className="text-brand hover:underline">
            tell us about it
          </a>
          .
          If you believe someone is in immediate danger, contact your local emergency services first.
        </p>
      </Section>

      <Section id="features" title="Ghosting, disappearing messages and calls">
        <p>
          Ghosting lets you quiet or lock a one-to-one chat on your own terms. It controls what the other person
          can send you inside Ghost-ed. It doesn&apos;t stop them from reaching you some other way, and it
          isn&apos;t a substitute for reporting someone who is putting you at risk.
        </p>
        <p>
          A view-once photo can be opened a single time by each person it is sent to, and the file is then removed
          from our servers. We can&apos;t stop someone from photographing their screen, though, so please only
          send things you would be comfortable with the recipient keeping.
        </p>
        <p>
          When disappearing messages are on, new messages are wiped for everyone once the time you picked has
          passed, counted from when each one is seen. In a group, the clock starts once everyone in it has seen
          the message, and a message nobody has opened yet stays until they do. Using &ldquo;undo seen&rdquo;
          stops the clock again. The content and any attachments are deleted from our
          servers. We keep a bare record that a message was sent, and by whom and when, because features like
          streaks rely on it; we could see that much anyway. As with view-once photos, anyone in the chat can
          still save or screenshot a message before it goes.
        </p>
        <p>
          Voice and video calls connect directly between the people on the call wherever possible. When a direct
          connection isn&apos;t possible, the call may pass through a relay server, still encrypted. We don&apos;t
          record calls. Please don&apos;t record anyone yourself without their permission, and remember that
          Ghost-ed is not a replacement for a phone line and can&apos;t be used to reach emergency services.
        </p>
        <p>
          Scheduled messages are sent at the time you choose, as long as the service is running. We will do our
          best, but we can&apos;t promise that a message will go out to the exact minute.
        </p>
      </Section>

      <Section id="third-parties" title="Services we rely on">
        <p>
          A few parts of Ghost-ed depend on other companies. Verification and password reset codes are sent by
          email through a delivery provider. GIF search is powered by GIPHY, and GIFs you pick from it are subject
          to GIPHY&apos;s own terms. Calls may use public servers to help devices find each other. We only share
          what each of these services needs to do its job, and we aren&apos;t responsible for how they run their
          own services.
        </p>
      </Section>

      <Section id="copyright" title="Copyright and intellectual property">
        <p>
          The Ghost-ed name, the ghost logo, the look and feel of the app, the built-in stickers, and the software
          that runs it are owned by {COPYRIGHT_OWNER} and protected by copyright, trademark and other laws. We
          give you a personal, non-exclusive, non-transferable and revocable licence to use the app as it is
          meant to be used. That licence doesn&apos;t let you copy, modify, resell or redistribute any part of
          Ghost-ed, reverse-engineer it except where the law allows, or use our name and logo in a way that
          suggests we endorse you.
        </p>
        <p>
          If you send us ideas or feedback, we may use them to improve Ghost-ed without owing you anything for it.
          We are always grateful for them all the same.
        </p>
        <p>
          Our{' '}
          <Link href="/copyright" className="text-brand hover:underline">
            Copyright Notice
          </Link>{' '}
          and{' '}
          <Link href="/intellectual-property" className="text-brand hover:underline">
            Intellectual Property Notice
          </Link>{' '}
          set this out in more detail.
        </p>
        <p>
          We respect other people&apos;s work and expect you to do the same. If you believe something on Ghost-ed
          infringes your copyright, please get in touch with:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your name and contact details;</li>
          <li>a description of the work you believe has been copied;</li>
          <li>where it appears on Ghost-ed, such as the username, group or sticker pack;</li>
          <li>
            a statement that you believe in good faith the use isn&apos;t authorised, and that the information in
            your notice is accurate and you are the owner or allowed to act for them.
          </li>
        </ul>
        <p>
          Since most content is end-to-end encrypted, we often can&apos;t see the material itself. We will act on
          what we can: removing public content such as profile pictures or sticker packs, and closing the accounts
          of people who infringe again and again.
        </p>
      </Section>

      <Section id="ending" title="Suspending or closing an account">
        <p>
          You can stop using Ghost-ed whenever you like. If you would like your account and its data deleted,
          contact us from the email address on the account and we will take care of it.
        </p>
        <p>
          We may limit, suspend or close an account that breaks these terms, puts other people at risk, or exposes
          us to legal trouble. Where it is reasonable and safe to do so, we will tell you first and explain why.
          If you think we have made a mistake, reply and we will take another look.
        </p>
      </Section>

      <Section id="as-is" title="The service as it is">
        <p>
          We work hard to keep Ghost-ed reliable and secure, but we can&apos;t promise it will always be
          available, free of bugs, or that a message or call will always get through. We may change, pause or
          retire features as the app grows. To the fullest extent the law allows, Ghost-ed is provided &ldquo;as
          is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, whether express or implied.
        </p>
        <p>
          Please keep your own copies of anything that matters to you. End-to-end encryption means that if your
          keys are lost, we can&apos;t recover the messages they protected.
        </p>
      </Section>

      <Section id="liability" title="Limits on our liability">
        <p>
          To the fullest extent the law allows, we aren&apos;t liable for indirect, incidental, special or
          consequential losses, or for lost data, profits or goodwill, arising from your use of Ghost-ed. We also
          aren&apos;t responsible for what other users say or do. Nothing in these terms limits liability that
          can&apos;t be limited by law, or takes away rights you have as a consumer where you live.
        </p>
      </Section>

      <Section id="changes" title="Changes to these terms">
        <p>
          As Ghost-ed changes, these terms will too. When we make a change that matters, we will update the date
          at the top of this page and, where it makes sense, let you know in the app before it takes effect. If
          you keep using Ghost-ed after that, you are agreeing to the updated terms. If you don&apos;t agree, you
          can close your account at any time.
        </p>
      </Section>

      <Section id="contact" title="Getting in touch">
        <p>
          Questions, reports and copyright notices can all be sent the same way: reply to any email we have sent
          you, such as your verification code, and it will reach a real person on our team. We read everything,
          and we will get back to you as soon as we can.
        </p>
      </Section>
    </LegalPage>
  );
}
