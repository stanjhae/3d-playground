import { Link, createFileRoute } from '@tanstack/react-router'

import { CONTACT_EMAIL } from '../lib/alpha-contact'

/** What the alpha stores and how to remove it (Q10 #195). */

export const Route = createFileRoute('/privacy')({
  component: Privacy,
})

const sectionClass = 'flex flex-col gap-2'
const headingClass = 'font-display text-2xl'
const textClass = 'font-body text-sm leading-relaxed text-flv-muted'

function Privacy() {
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
        <h1 className="font-display text-4xl leading-tight">Privacy and your designs</h1>
        <p className={textClass}>
          Fashion Leader Vote is an early alpha. This page says what it keeps, who can see it, and how to remove it.
        </p>
      </header>

      <div className={sectionClass}>
        <h2 className={headingClass}>What is stored</h2>
        <ul className={`${textClass} list-disc pl-5`}>
          <li>Your email address, to send sign-in codes. There are no passwords.</li>
          <li>Your designs and their saved history, private to your account.</li>
          <li>Images you upload into a design, checked and stored privately.</li>
          <li>Unsaved changes, kept only in this browser until they reach your account.</li>
          <li>
            If you join the waitlist: the email address you enter, kept only to tell you when there’s news. It isn’t
            linked to an account.
          </li>
          <li>
            If you publish a design: the version you chose, five pictures of it, its name and the public name you
            entered.
          </li>
          <li>Your votes on shared designs, one per design, linked to your account.</li>
          <li>
            To stop any one visitor flooding the site: a scrambled form of your device’s network address, never the
            address itself, with a count of recent requests. It is deleted within a day.
          </li>
        </ul>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Who can see it</h2>
        <p className={textClass}>
          Only you can see your designs, history, uploads and votes. Others see only how many votes a shared design
          has, never who voted. A published design can be viewed, and its pictures
          copied, by anyone with its link. Unpublishing or deleting it stops the link and its pictures working straight
          away. A page someone already has open may keep showing its pictures, and pictures someone already saved can't
          be taken back.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Usage counts</h2>
        <p className={textClass}>
          To learn whether the alpha works, it counts a few steps in total, such as signing in, creating, saving and
          publishing a design. It also counts how fast pages load and respond: for each page visit, whether loading,
          responding to a tap or click, and layout shifts were good, slow or poor, and for saving and drawing, a
          rough time range. No exact times are sent. The counts carry no email, account, design or device identifiers
          and no design content.
          There are no ads, and nothing is sold or shared for marketing.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Error reports</h2>
        <p className={textClass}>
          When a page breaks, the site sends a short report so it can be fixed: the kind of error, its message, where
          in the code it happened, which page it was on (without any design or link ID) and which version of the site
          was running. Email addresses, sign-in codes, tokens and IDs are removed from it first. It doesn’t include your
          account, your designs or your device’s address. Reports go to this site, which passes them on to Sentry, our
          error tracking service, where they are kept for up to 90 days.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Removing your data</h2>
        <p className={textClass}>
          Delete any design from <Link to="/studio" className="underline">My Studio</Link>; its history, pictures and
          public link go with it. To delete your whole account, choose Delete account at the bottom of My Studio and
          type your email to confirm: your designs, history, pictures, uploads and public links are removed straight
          away, and you are signed out. Copies in encrypted backups are deleted within 30 days. To leave the waitlist,
          email {contact} from the address you joined with.
        </p>
      </div>

      <div id="report" className={sectionClass}>
        <h2 className={headingClass}>Reporting a design</h2>
        <p className={textClass}>
          Every shared design page has a “Report this design” link. Reports go to {contact}, and a design that breaks
          the rules is unpublished and can’t be published again unless the decision is reversed. Its owner keeps the
          design itself.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Credits</h2>
        <p className={textClass}>
          This site uses open-source fonts and software. See the{' '}
          <a className="underline" href="/third-party-notices.txt">
            third-party notices
          </a>
          .
        </p>
      </div>
    </section>
  )
}
