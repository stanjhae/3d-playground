import { FLV_COPY } from '../../lib/flv-copy'
import {
  LANDING_RAIL,
  type LandingStageId,
} from '../../lib/landing-stages'

const FLOW_LEADS = [
  FLV_COPY.flowGarmentLead,
  FLV_COPY.flowDesignLead,
  FLV_COPY.flowTryShareLead,
] as const

export function LandingFlowOverview({
  onSelect,
}: {
  onSelect: ({ stage }: { stage: LandingStageId }) => void
}) {
  return (
    <section
      id="flow"
      className="flex flex-col gap-6 border-b border-flv-line px-6 py-12 sm:px-10"
    >
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl text-flv-ink sm:text-4xl">
          {FLV_COPY.flowTitle}
        </h2>
        <p className="font-body text-sm text-flv-muted">{FLV_COPY.flowLead}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {LANDING_RAIL.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              onSelect({ stage: entry.id })
            }}
            className="flv-panel flex flex-col gap-3 p-5 text-left transition hover:-translate-y-0.5"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-flv-accent font-body text-xs text-white">
              {index + 1}
            </span>
            <h3 className="font-display text-2xl text-flv-ink">{entry.label}</h3>
            <p className="font-body text-sm text-flv-muted">
              {FLOW_LEADS[index]}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}
