import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { FLV_COPY } from '../../lib/flv-copy'
import { GRAPHIC_ASSETS } from '../../lib/graphics-library'

export function LandingHero({
  stage,
}: {
  stage: ReactNode
}) {
  return (
    <section
      id="product"
      className="relative flex min-h-[min(100dvh,64rem)] flex-col gap-8 px-4 pt-28 pb-10 sm:px-8 lg:px-10 lg:pt-32"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-xl flex-col gap-4">
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
          <h1 className="font-display text-4xl leading-tight text-flv-ink sm:text-5xl lg:text-6xl">
            {FLV_COPY.heroHeadline}{' '}
            <span className="flv-text-gradient">{FLV_COPY.heroHeadlineAccent}</span>
          </h1>
          <p className="font-body text-base text-flv-muted sm:text-lg">
            Draw freely, refine digitally and see every change instantly on a
            realistic 3D garment.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/create"
              search={{ garment: 'tee', step: 'select' }}
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
        </div>
        <div className="hidden shrink-0 flex-col gap-2 lg:flex">
          <ConceptPreviewBadge />
          <p className="font-body text-xs tracking-[0.08em] text-flv-muted">
            {FLV_COPY.statWaitlist}
          </p>
        </div>
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <aside className="flv-panel order-2 flex flex-col gap-3 p-4 lg:order-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-body text-xs tracking-[0.16em] text-flv-accent uppercase">
              {FLV_COPY.designLayerDraw}
            </p>
            <span className="flv-live-badge">⚡ {FLV_COPY.designLive}</span>
          </div>
          <div className="flex min-h-40 flex-1 items-center justify-center rounded-xl bg-flv-soft">
            <img
              src="/graphics/cross-gothic.svg"
              alt=""
              className="h-28 w-20 object-contain"
            />
          </div>
          <p className="font-body text-xs text-flv-muted">
            {FLV_COPY.designLiveSync}
          </p>
        </aside>

        <div className="relative order-1 min-h-96 overflow-hidden rounded-2xl bg-flv-ink lg:order-2 lg:min-h-[28rem]">
          {stage}
          <span className="flv-live-badge absolute top-4 left-1/2 z-10 -translate-x-1/2">
            ⚡ Live 3D Update
          </span>
        </div>

        <aside className="flv-panel order-3 flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-body text-xs tracking-[0.16em] text-flv-accent uppercase">
              {FLV_COPY.suggestionsTitle}
            </p>
            <ConceptPreviewBadge />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {GRAPHIC_ASSETS.filter((asset) => asset.category === 'crosses')
              .slice(0, 6)
              .map((asset) => (
                <div
                  key={asset.id}
                  className="flex aspect-square items-center justify-center rounded-lg border border-flv-line bg-white p-2"
                >
                  <img
                    src={asset.src}
                    alt={asset.label}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ))}
          </div>
          <Link
            to="/create"
            search={{ garment: 'tee', step: 'design' }}
            className="flv-cta inline-flex min-h-11 items-center justify-center px-4 font-body text-[0.65rem] tracking-[0.1em] uppercase"
          >
            {FLV_COPY.suggestionsApply}
          </Link>
          <div className="mt-auto flex flex-col gap-2 border-t border-flv-line pt-3">
            <p className="font-body text-xs tracking-[0.16em] text-flv-accent uppercase">
              {FLV_COPY.designLayerPreview}
            </p>
            <div className="grid grid-cols-4 gap-1">
              {['Front', 'Back', 'Left', 'Right'].map((label) => (
                <div
                  key={label}
                  className="rounded-md border border-flv-line bg-flv-soft px-1 py-2 text-center font-body text-[0.55rem] tracking-[0.08em] text-flv-muted uppercase"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-4 border-t border-flv-line pt-6 md:grid-cols-3">
        {[
          {
            title: '01 Three Creative Workflows',
            lead: 'Draw / Suggestions / 3D Preview',
          },
          {
            title: '02 Four-Sided Design',
            lead: 'Front / Back / Left / Right',
          },
          {
            title: '03 Try On. Create Content. Share.',
            lead: 'Your designs. Your community.',
          },
        ].map((item) => (
          <div key={item.title} className="flex flex-col gap-1">
            <p className="font-body text-xs tracking-[0.12em] text-flv-ink uppercase">
              {item.title}
            </p>
            <p className="font-body text-sm text-flv-muted">{item.lead}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
