import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { FLV_COPY } from '../../lib/flv-copy'

export function LandingHero({
  stage,
}: {
  stage: ReactNode
}) {
  return (
    <section
      id="product"
      className="relative grid min-h-[min(100dvh,56rem)] grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
    >
      <div className="relative z-10 flex flex-col justify-center gap-6 px-6 pt-28 pb-10 sm:px-10 lg:py-24">
        <div className="flex items-end gap-3">
          <p className="font-display text-5xl leading-none tracking-tight text-flv-accent sm:text-6xl">
            {FLV_COPY.brandMark}
          </p>
          <p className="pb-1 font-body text-[0.65rem] leading-tight tracking-[0.18em] text-flv-ink uppercase">
            Fashion
            <br />
            Leader Vote
          </p>
        </div>
        <p className="font-body text-xs tracking-[0.22em] text-flv-muted uppercase">
          {FLV_COPY.heroEyebrow}
        </p>
        <h1 className="max-w-xl font-display text-4xl leading-tight text-flv-ink sm:text-5xl lg:text-6xl">
          {FLV_COPY.heroHeadline}{' '}
          <span className="flv-text-gradient">{FLV_COPY.heroHeadlineAccent}</span>
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
            {FLV_COPY.openStudio} →
          </Link>
          <a
            href="#waitlist"
            className="inline-flex min-h-12 items-center rounded-full border border-flv-ink px-6 font-body text-xs tracking-[0.12em] text-flv-ink uppercase hover:border-flv-accent hover:text-flv-accent"
          >
            {FLV_COPY.joinWaitlist}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
          {[FLV_COPY.statWaitlist, FLV_COPY.statRealtime, FLV_COPY.statInfinite].map(
            (stat) => (
              <p
                key={stat}
                className="font-body text-xs tracking-[0.06em] text-flv-muted"
              >
                {stat}
              </p>
            ),
          )}
        </div>
      </div>
      <div className="relative min-h-96 overflow-hidden lg:min-h-full">
        {stage}
        <span className="flv-live-badge absolute top-4 right-4 z-10">
          ⚡ {FLV_COPY.designLive}
        </span>
      </div>
      <p className="flv-vertical-tag pointer-events-none absolute top-28 right-3 hidden xl:block">
        {FLV_COPY.verticalLead} {FLV_COPY.verticalCreate}{' '}
        {FLV_COPY.verticalShare} {FLV_COPY.verticalLeadWord}
      </p>
    </section>
  )
}
