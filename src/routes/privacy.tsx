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
            If you publish a design: the version you chose, three pictures of it, its name and the public name you
            entered.
          </li>
        </ul>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Who can see it</h2>
        <p className={textClass}>
          Only you can see your designs, history and uploads. A published design can be viewed, and its pictures
          copied, by anyone with its link. Unpublishing or deleting it stops the link and its pictures working straight
          away. Pictures someone already saved can't be taken back.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Usage counts</h2>
        <p className={textClass}>
          To learn whether the alpha works, it counts a few steps in total, such as signing in, creating, saving and
          publishing a design. The counts carry no email, account, design or device identifiers and no design content.
          There are no ads, and nothing is sold or shared for marketing.
        </p>
      </div>

      <div className={sectionClass}>
        <h2 className={headingClass}>Removing your data</h2>
        <p className={textClass}>
          Delete any design from <Link to="/studio" className="underline">My Studio</Link>; its history, pictures and
          public link go with it. To delete your whole account, email {contact} from the address you sign in with.
        </p>
      </div>

      <div id="report" className={sectionClass}>
        <h2 className={headingClass}>Reporting a design</h2>
        <p className={textClass}>
          Every shared design page has a “Report this design” link. Reports go to {contact}, and a design that breaks
          the rules is unpublished.
        </p>
      </div>
    </section>
  )
}
