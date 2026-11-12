import { CONTACT_EMAIL } from '../../lib/alpha-contact'
import { LANDING_COPY, LANDING_NAV } from '../../lib/landing-copy'
import { BrandMark } from '../site/LandingHeader'
import { type LandingMode, SiteLink } from './LandingLink'

const linkClass = 'inline-flex min-h-11 items-center text-flv-muted underline-offset-4 hover:text-flv-ink hover:underline'

/** The landing's own footer; other pages keep the slim SiteFooter. */
export function LandingFooter({ mode }: { mode: LandingMode }) {
  const footer = LANDING_COPY.footer

  return (
    <footer className="border-t border-flv-line bg-flv-paper px-4 pt-16 pb-10 font-body text-sm sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          <a href="#product" className="flex w-fit items-center gap-2.5 text-flv-ink">
            <BrandMark />
          </a>
          <p className="max-w-xs text-flv-muted">{footer.tagline}</p>
        </div>
        <nav aria-label={footer.product} className="flex flex-col">
          <p className="mb-1 text-xs tracking-[0.18em] text-flv-ink uppercase">{footer.product}</p>
          {LANDING_NAV.map((link) => (
            <a key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label={footer.studio} className="flex flex-col">
          <p className="mb-1 text-xs tracking-[0.18em] text-flv-ink uppercase">{footer.studio}</p>
          <SiteLink mode={mode} to="/studio" className={linkClass}>
            {LANDING_COPY.hero.cta}
          </SiteLink>
          <a href="#waitlist" className={linkClass}>
            {LANDING_COPY.final.waitlistButton}
          </a>
        </nav>
        <nav aria-label={footer.legal} className="flex flex-col">
          <p className="mb-1 text-xs tracking-[0.18em] text-flv-ink uppercase">{footer.legal}</p>
          <SiteLink mode={mode} to="/privacy" className={linkClass}>
            Privacy
          </SiteLink>
          <SiteLink mode={mode} to="/terms" className={linkClass}>
            Terms
          </SiteLink>
          {CONTACT_EMAIL ? (
            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
              Contact
            </a>
          ) : null}
          <a href="/third-party-notices.txt" className={linkClass}>
            {footer.credits}
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-12 max-w-7xl border-t border-flv-line pt-6 text-xs text-flv-muted">{footer.alpha}</p>
    </footer>
  )
}
