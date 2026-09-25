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
      className="flex flex-wrap gap-2 border-b border-flv-line px-6 py-4 sm:px-10"
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
            }}
            className={cn(
              'min-h-11 border px-4 font-body text-xs tracking-[0.1em] uppercase',
              {
                'border-flv-accent text-flv-accent': active,
                'border-flv-line text-flv-muted hover:border-flv-accent hover:text-flv-accent':
                  !active,
              },
            )}
          >
            <span className="mr-2 text-flv-accent">0{index + 1}</span>
            {entry.label}
          </button>
        )
      })}
    </nav>
  )
}
