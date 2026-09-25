import { cn } from '../../lib/cn'
import { FLV_COPY } from '../../lib/flv-copy'
import {
  LANDING_RAIL,
  type LandingStageId,
} from '../../lib/landing-stages'

export function LandingStageRail({
  activeStage,
  onSelect,
}: {
  activeStage: LandingStageId
  onSelect: ({ stage }: { stage: LandingStageId }) => void
}) {
  return (
    <nav
      aria-label={FLV_COPY.possibilities}
      className="sticky top-0 z-20 flex flex-wrap gap-2 border-b border-flv-line bg-flv-paper/95 px-6 py-4 backdrop-blur-sm sm:px-10"
    >
      {LANDING_RAIL.map((entry, index) => {
        const active =
          entry.id === activeStage ||
          (entry.id === 'design' &&
            (activeStage === 'fit' ||
              activeStage === 'color' ||
              activeStage === 'design')) ||
          (entry.id === 'preview' &&
            (activeStage === 'preview' ||
              activeStage === 'share' ||
              activeStage === 'vote'))

        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onSelect({ stage: entry.id })
              document
                .getElementById('product-stages')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className={cn(
              'min-h-11 rounded-full border px-4 font-body text-xs tracking-[0.1em] uppercase transition',
              {
                'border-flv-accent bg-flv-accent text-white': active,
                'border-flv-line text-flv-muted hover:border-flv-accent hover:text-flv-accent':
                  !active,
              },
            )}
          >
            <span
              className={cn('mr-2', {
                'text-white': active,
                'text-flv-accent': !active,
              })}
            >
              0{index + 1}
            </span>
            {entry.label}
          </button>
        )
      })}
    </nav>
  )
}
