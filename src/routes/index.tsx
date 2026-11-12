import { createFileRoute, redirect } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'

import { HeroStage } from '../components/landing/HeroStage'
import { LandingFooter } from '../components/landing/LandingFooter'
import { LandingBody, LandingHeroSection } from '../components/landing/LandingSections'
import { trackAssumption } from '../lib/assumption-events'
import { scrollToSection } from '../lib/prefers-reduced-motion'
import { releaseStaticShell, STATIC_LANDING_ID } from '../lib/static-shell'

/** Dev only: the poster's photo bench (scripts/bake-landing-poster.mjs). */
const PosterBench = lazy(() => import('../components/landing/PosterBench'))

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => {
    const design = typeof search.design === 'string' && search.design.length > 0 ? search.design : undefined

    return design ? { design } : {}
  },
  beforeLoad: ({ search }) => {
    if (search.design) {
      throw redirect({ to: '/create', search: { design: search.design } })
    }
  },
  component: LandingPage,
})

/**
 * The landing (docs/claims-audit.md). The same sections are prerendered at
 * build time (src/prerender/landing.tsx); this live version takes over once
 * it has mounted, with the poster already in place, so nothing jumps.
 */
function LandingPage() {
  // Read before the layout effect removes it: the prerendered page already
  // played the entrance, so the live one doesn't play it again.
  const [hadStatic] = useState(() => Boolean(window.document.getElementById(STATIC_LANDING_ID)))

  useLayoutEffect(() => {
    // Over the prerendered page the live one has the same layout, so the
    // reader's place is kept as it is. Without it (dev, a client-side visit)
    // a #section link is honoured once the sections exist.
    if (releaseStaticShell()) {
      return
    }

    const target = window.location.hash ? window.document.getElementById(window.location.hash.slice(1)) : null
    target?.scrollIntoView({ block: 'start' })
  }, [])

  useEffect(() => {
    void trackAssumption({ name: 'viewed_demo' })
  }, [])

  // In-page links glide to their section (header, hero, footer, menu).
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]')
      const id = link?.getAttribute('href')?.slice(1)

      if (!id || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) {
        return
      }

      if (scrollToSection({ id })) {
        event.preventDefault()
        window.history.replaceState(window.history.state, '', `#${id}`)
      }
    }

    window.document.addEventListener('click', onClick)
    return () => window.document.removeEventListener('click', onClick)
  }, [])

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('poster')) {
    return (
      <Suspense fallback={null}>
        <PosterBench />
      </Suspense>
    )
  }

  return (
    <div className="flv min-h-dvh">
      <LandingHeroSection mode="live" stage={<HeroStage />} intro={!hadStatic} />
      <LandingBody mode="live" />
      <LandingFooter mode="live" />
    </div>
  )
}
