import { Link, createFileRoute } from '@tanstack/react-router'

import { CONTACT_EMAIL } from '../lib/alpha-contact'
import { TERMS_UPDATED, TERMS_VERSION } from '../lib/terms'

/**
 * Terms of use (P1). Accounts accept them once, before My Studio opens
 * (`TermsGate`); a change here needs a new `TERMS_VERSION` in
 * `src/lib/terms.ts`, which asks everyone again. Plain language, written
 * for the alpha; the owner reviews the wording before launch.
 */

export const Route = createFileRoute('/terms')({
  component: Terms,
})

const sectionClass = 'flex flex-col gap-2'
const headingClass = 'font-display text-2xl'
const textClass = 'font-body text-sm leading-relaxed text-flv-muted'

function Terms() {
  const contact = CONTACT_EMAIL ? (
    <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  ) : (
    'the alpha contact address (shared with alpha testers)'
  )

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-2">
        <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Alpha</p>
        <h1 className="font-display text-4xl leading-tight">Terms of use</h1>
        <p className={textClass}>
          Last updated {TERMS_UPDATED} (version {TERMS_VERSION}). By creating an account or using Fashion Leader Vote you
          agree to these terms. The <Link to="/privacy" className="underline">privacy page</Link> says what is stored
          and how to remove it.
        </p>
      </header>

      <div className={sectionClass}>
        <h2 className={headingClass}>An early alpha</h2>
        <p className={textClass}>
          Fashion Leader Vote is an early alpha for designing T-shirts in 3D and sharing them. Features can change or
          be removed, and the service can be paused or stop. It is provided as it is, without promises that it will
          always be available or free of mistakes. Your work is backed up, but keep your own copy of anything you can’t
          afford to lose.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Your account</h2>
        <p className={textClass}>
          You sign in with a code sent to your email. Keep access to that inbox to yourself; whatever is done after
          signing in with it is treated as done by you. One person per account. You need to be old enough to agree to
          these terms where you live, and at least 16.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Your designs</h2>
        <p className={textClass}>
          Your designs stay yours. To run the service, you let us store them, make the pictures of them that publishing
          needs, and show a published design to anyone with its link until you unpublish or delete it. That permission
          ends when the design or your account is deleted, apart from copies in backups until those expire.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>What you may upload and publish</h2>
        <ul className={`${textClass} list-disc pl-5`}>
          <li>Only images and text you made, or have the right to use.</li>
          <li>No one else’s logos, trademarks or artwork without permission.</li>
          <li>Nothing illegal, hateful, harassing, sexually explicit or violent, and nothing about a real person without their consent.</li>
          <li>No attempts to break, overload or get around the limits of the service, or to reach other people’s accounts.</li>
        </ul>
        <p className={textClass}>
          A design that breaks these rules can be unpublished or removed, and an account that keeps breaking them can be
          closed. Anyone can report a published design from its page.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Leaving</h2>
        <p className={textClass}>
          You can delete your account at any time from <Link to="/studio" className="underline">My Studio</Link>. It
          removes your designs, their history and pictures, your uploads and your public links straight away, and signs
          you out.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Changes to these terms</h2>
        <p className={textClass}>
          If these terms change, you’ll be asked to read and accept the new version the next time you open My Studio.
          Questions about them go to {contact}.
        </p>
      </div>
    </section>
  )
}
