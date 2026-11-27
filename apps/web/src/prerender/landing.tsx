import { renderToString } from 'react-dom/server'

import { LandingFooter } from '../components/landing/LandingFooter'
import { LandingBody, LandingHeroSection } from '../components/landing/LandingSections'
import { BrandMark, LandingHeader, MENU_LINK_CLASS } from '../components/site/LandingHeader'
import { authConfigured } from '../lib/auth/supabase-client'
import { FLV_COPY } from '../lib/flv-copy'
import { landingHead } from '../lib/landing-seo'
import { STATIC_LANDING_ID } from '../lib/static-shell'

/**
 * The landing as plain HTML, built by scripts/prerender-landing.mjs into
 * dist/index.html: what search engines read and what people see before the
 * app's scripts arrive. The same section components as the live page, with
 * plain links and no 3D, router or stores (src/lib/static-shell.ts).
 */
function LandingStatic({ signIn }: { signIn: boolean }) {
  const account = (className: string) =>
    signIn ? (
      <a href="/sign-in?returnTo=%2Fstudio" className={className}>
        {FLV_COPY.login}
      </a>
    ) : null

  return (
    <div className="flv flex min-h-dvh flex-col">
      <LandingHeader
        mode="static"
        home={
          <a href="/" className="flex shrink-0 items-center gap-2.5 text-flv-ink">
            <BrandMark />
          </a>
        }
        account={account('hidden min-h-11 items-center px-1 font-body text-sm text-flv-muted hover:text-flv-ink md:inline-flex')}
        menuAccount={account(MENU_LINK_CLASS)}
      />
      <main className="relative flex-1 bg-flv-paper text-flv-ink">
        <div className="flv min-h-dvh">
          <LandingHeroSection mode="static" />
          <LandingBody mode="static" />
          <LandingFooter mode="static" />
        </div>
      </main>
    </div>
  )
}

export function renderLanding({ origin }: { origin: string }) {
  return {
    head: landingHead({ origin }),
    body: `<div id="${STATIC_LANDING_ID}">${renderToString(<LandingStatic signIn={authConfigured()} />)}</div>`,
  }
}

// The build script is plain Node: it reads these from the same bundle.
export { allLandingStrings } from '../lib/landing-copy'
export { findForbiddenClaim } from '../lib/claims-patterns'
export { injectBeforeRoot, replaceSiteHead } from '../lib/html-shell'
export { robotsTxt, siteIndexable, siteOrigin, sitemapXml } from '../lib/site-origin'
export { heroPosterSrcSet, HERO_POSTER } from '../components/landing/HeroPoster'
