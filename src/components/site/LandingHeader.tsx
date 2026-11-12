import type { ReactNode } from 'react'

import { FLV_COPY } from '../../lib/flv-copy'
import { LANDING_COPY, LANDING_NAV } from '../../lib/landing-copy'
import { CreateCta, type LandingMode } from '../landing/LandingLink'
import { SiteMenu } from './SiteMenu'

/** The landing's sections, in page order: every link has a section to land on. */
export const LANDING_LINKS = LANDING_NAV

export const MENU_LINK_CLASS = 'flex min-h-11 items-center rounded-lg px-3 text-flv-ink hover:bg-flv-soft'

/** The FLV mark and name; `home` is the element that wraps it (a link). */
export function BrandMark() {
  return (
    <>
      <span className="flv-text-gradient font-display text-3xl leading-none">{FLV_COPY.brandMark}</span>
      <span className="hidden font-display text-[0.65rem] leading-[1.1] tracking-normal uppercase sm:block">
        Fashion
        <br />
        Leader Vote
      </span>
    </>
  )
}

/**
 * The landing's sticky header: the page's sections, the account link and
 * Start creating. `home` is the brand link and `account` the Sign in / My
 * Studio link (`menuAccount` its phone-menu version); the app passes router
 * links, the prerender plain ones.
 */
export function LandingHeader({
  mode,
  home,
  account,
  menuAccount,
}: {
  mode: LandingMode
  home: ReactNode
  account: ReactNode
  menuAccount: ReactNode
}) {
  return (
    <header className="flv-landing-header fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-flv-ink sm:px-6 sm:pt-4 sm:pb-4">
      {home}
      <nav aria-label="Site" className="hidden items-center gap-7 font-body text-sm lg:flex">
        {LANDING_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center border-b-2 border-transparent px-1 text-flv-muted hover:border-flv-accent hover:text-flv-ink"
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2 sm:gap-3">
        {account}
        <CreateCta mode={mode} size="md" className="hidden sm:inline-flex">
          {LANDING_COPY.hero.cta}
        </CreateCta>
        <SiteMenu>
          {LANDING_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={MENU_LINK_CLASS}>
              {link.label}
            </a>
          ))}
          {menuAccount}
        </SiteMenu>
      </div>
    </header>
  )
}
