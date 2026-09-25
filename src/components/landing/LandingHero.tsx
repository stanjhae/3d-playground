import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { FLV_COPY } from '../../lib/flv-copy'

export function LandingHero({
  stage,
}: {
  stage: ReactNode
}) {
  return (
    <section className="relative grid min-h-[min(100dvh,52rem)] grid-cols-1 lg:grid-cols-2">
      <div className="relative z-10 flex flex-col justify-center gap-6 px-6 pt-28 pb-10 sm:px-10 lg:py-24">
        <p className="font-display text-xs tracking-[0.28em] text-flv-accent uppercase">
          {FLV_COPY.brand}
        </p>
        <h1 className="max-w-xl font-display text-4xl leading-tight text-flv-ink sm:text-5xl lg:text-6xl">
          {FLV_COPY.heroHeadline}
        </h1>
        <p className="max-w-md font-body text-base text-flv-muted sm:text-lg">
          {FLV_COPY.heroLead}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/create"
            search={{}}
            className="flv-cta inline-flex min-h-12 items-center px-6 font-body text-xs tracking-[0.12em] uppercase"
          >
            {FLV_COPY.openStudio}
          </Link>
          <a
            href="#waitlist"
            className="inline-flex min-h-12 items-center border border-flv-line px-6 font-body text-xs tracking-[0.12em] text-flv-ink uppercase hover:border-flv-accent hover:text-flv-accent"
          >
            {FLV_COPY.joinWaitlist}
          </a>
        </div>
      </div>
      <div className="relative min-h-80 border-t border-flv-line lg:min-h-full lg:border-t-0 lg:border-l">
        {stage}
      </div>
    </section>
  )
}
