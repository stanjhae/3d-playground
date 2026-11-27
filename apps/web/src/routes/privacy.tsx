import { Link, createFileRoute } from '@tanstack/react-router'

import { AI_ASSIST } from '../lib/ai-assist'
import { CONTACT_EMAIL } from '../lib/alpha-contact'
import { PRODUCT_ANALYTICS } from '../lib/analytics'
import { COMMUNITY } from '../lib/community'
import { PATTERN_BETA } from '../lib/pattern-beta'

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
          {PATTERN_BETA ? (
            <li>For designs that use Pattern (beta), the draped 3D garment, stored privately with your uploads.</li>
          ) : null}
          <li>Unsaved changes, kept only in this browser until they reach your account.</li>
          <li>
            If you join the waitlist: the email address you enter, kept only to tell you when there’s news. It isn’t
            linked to an account.
          </li>
          <li>
            If you publish a design: the version you chose, five pictures of it, its name and the public name you
            entered.
          </li>
          <li>
            Your votes on shared designs, one per design, linked to your account. A new account’s votes start counting
            once the account is a day old.
          </li>
          <li>
            If you turn on a public profile: the handle you choose. Your profile page shows that handle, your public
            name and your published designs with their votes, until you turn it off.
          </li>
          <li>Reports you send about a design: which design, the reason and any note, linked to your account.</li>
          {COMMUNITY ? (
            <>
              <li>
                Comments you post on shared designs, shown to anyone with the design’s link beside your public name or
                handle, until you delete them.
              </li>
              <li>Which designers you follow. Others see how many people follow a designer, never who.</li>
            </>
          ) : null}
          <li>Which version of the terms of use you accepted, and when.</li>
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

      {PRODUCT_ANALYTICS ? (
        <div className={sectionClass}>
          <h2 className={headingClass}>How the site is used</h2>
          <p className={textClass}>
            To see which tools people use and where they get stuck, the site sends anonymous usage events to PostHog, a
            product analytics service, which keeps them in the EU. An event says what was done, such as opening the
            text tool, picking a fabric, undoing or publishing, and on which page, without the design or link ID. Each
            visit gets a random ID that is held only in memory and forgotten when you reload or close the page: no
            cookies or browser storage are used, and you are never linked to your account, email or designs. Events
            never include your words, images, colours or titles. Some visits are recorded as a replay of the page
            layout, clicks and scrolling, with every typed field and all text hidden; 3D views and drawings aren’t
            recorded. If your browser sends Do Not Track or Global Privacy Control, nothing is sent at all.
          </p>
        </div>
      ) : null}

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

      {AI_ASSIST ? (
        <div className={sectionClass}>
          <h2 className={headingClass}>AI suggestions</h2>
          <p className={textClass}>
            If you use AI suggestion (beta), the sketch and words you give it, and the garment’s pattern, are sent to
            Anthropic, whose Claude model suggests changes. They aren’t stored by this site. Anthropic handles them under
            its commercial terms, which don’t allow training on them. Nothing is sent unless you choose Suggest.
          </p>
        </div>
      ) : null}

      <div className={sectionClass}>
        <h2 className={headingClass}>Removing your data</h2>
        <p className={textClass}>
          Delete any design from <Link to="/studio" className="underline">My Studio</Link>; its history, pictures and
          public link go with it. To delete your whole account, choose Delete account at the bottom of My Studio and
          type your email to confirm: your designs, history, pictures, uploads, public links and votes are removed
          straight away, and you are signed out. Copies in encrypted backups are deleted within 30 days. To leave the waitlist,
          email {contact} from the address you joined with.
        </p>
      </div>

      <div id="report" className={sectionClass}>
        <h2 className={headingClass}>Reporting a design</h2>
        <p className={textClass}>
          Every shared design page has a “Report this design” link. Signed in, a report goes to the people who run the
          site, who alone can read it; the design’s owner never sees who reported it. Signed out, reports go to {contact}.
          A design that breaks
          the rules is unpublished and can’t be published again unless the decision is reversed. Its owner keeps the
          design itself. A note of the decision is kept: which link, why, who decided and when.
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
