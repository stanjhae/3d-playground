import { Link } from '@tanstack/react-router'

import { cn } from '../../lib/cn'
import type { HemId, NeckId, SleeveId } from '../../lib/design-document'
import type { GarmentId } from '../../lib/design-schema'
import { FLV_COPY } from '../../lib/flv-copy'
import { listRailGarments } from '../../lib/garments'
import {
  isCreateLandingStage,
  LANDING_STAGE_IDS,
  landingStageChip,
  landingStageLead,
  landingStageTitle,
  type LandingStageId,
} from '../../lib/landing-stages'
import { INK_COLORS } from '../../lib/paint-colors'

export function LandingStageHost({
  activeStage,
  garmentId,
  clothColor,
  neck,
  hem,
  sleeve,
  onStageChange,
  onGarmentChange,
  onColorChange,
  onNeckChange,
  onHemChange,
  onSleeveChange,
}: {
  activeStage: LandingStageId
  garmentId: GarmentId
  clothColor: string
  neck: NeckId
  hem: HemId
  sleeve: SleeveId
  onStageChange: ({ stage }: { stage: LandingStageId }) => void
  onGarmentChange: ({ garmentId }: { garmentId: GarmentId }) => void
  onColorChange: ({ color }: { color: string }) => void
  onNeckChange: ({ neck }: { neck: NeckId }) => void
  onHemChange: ({ hem }: { hem: HemId }) => void
  onSleeveChange: ({ sleeve }: { sleeve: SleeveId }) => void
}) {
  const title = landingStageTitle({ stage: activeStage })
  const lead = landingStageLead({ stage: activeStage })

  return (
    <section className="flex flex-col gap-5 border-b border-flv-line px-6 py-10 sm:px-10">
      <div className="flex flex-wrap gap-2">
        {LANDING_STAGE_IDS.map((stage) => (
          <button
            key={stage}
            type="button"
            aria-pressed={activeStage === stage}
            onClick={() => {
              onStageChange({ stage })
            }}
            className={cn(
              'min-h-9 border px-3 font-body text-xs tracking-[0.08em] uppercase',
              {
                'border-flv-accent text-flv-accent': activeStage === stage,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  activeStage !== stage,
              },
            )}
            >
              {landingStageChip({ stage })}
            </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl text-flv-ink">{title}</h2>
        <p className="max-w-2xl font-body text-sm text-flv-muted">{lead}</p>
      </div>
      {activeStage === 'select' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:max-w-3xl">
          {listRailGarments().map((garment) => (
            <button
              key={garment.id}
              type="button"
              aria-pressed={garmentId === garment.id}
              onClick={() => {
                onGarmentChange({ garmentId: garment.id })
              }}
              className={cn(
                'min-h-14 border px-3 text-left font-body text-xs tracking-[0.08em] uppercase',
                {
                  'border-flv-accent text-flv-accent': garmentId === garment.id,
                  'border-flv-line text-flv-muted hover:text-flv-accent':
                    garmentId !== garment.id,
                },
              )}
            >
              {garment.label}
            </button>
          ))}
        </div>
      ) : null}
      {activeStage === 'fit' ? (
        <div className="flex flex-wrap gap-2">
          <FitChip
            label="Crew"
            pressed={neck === 'crew'}
            onPress={() => {
              onNeckChange({ neck: 'crew' })
            }}
          />
          <FitChip
            label="V"
            pressed={neck === 'v'}
            onPress={() => {
              onNeckChange({ neck: 'v' })
            }}
          />
          <FitChip
            label="Crop"
            pressed={hem === 'crop'}
            onPress={() => {
              onHemChange({ hem: 'crop' })
            }}
          />
          <FitChip
            label="Long hem"
            pressed={hem === 'long'}
            onPress={() => {
              onHemChange({ hem: 'long' })
            }}
          />
          <FitChip
            label="Short sleeve"
            pressed={sleeve === 'short'}
            onPress={() => {
              onSleeveChange({ sleeve: 'short' })
            }}
          />
          <FitChip
            label="Long sleeve"
            pressed={sleeve === 'long'}
            onPress={() => {
              onSleeveChange({ sleeve: 'long' })
            }}
          />
        </div>
      ) : null}
      {activeStage === 'color' ? (
        <div className="flex flex-wrap gap-2">
          {INK_COLORS.slice(0, 6).map((ink) => (
            <button
              key={ink.id}
              type="button"
              aria-label={ink.name}
              aria-pressed={clothColor === ink.value}
              onClick={() => {
                onColorChange({ color: ink.value })
              }}
              className={cn('size-11 border', {
                'border-flv-accent': clothColor === ink.value,
                'border-flv-line': clothColor !== ink.value,
              })}
              style={{ backgroundColor: ink.value }}
            />
          ))}
        </div>
      ) : null}
      {activeStage === 'design' ? (
        <p className="font-body text-sm text-flv-muted">
          Front · Back · Left · Right — draw beside live cloth in the studio.
        </p>
      ) : null}
      {activeStage === 'preview' ? (
        <p className="font-body text-sm text-flv-muted">
          Front · 3/4 · Back · Orbit — camera presets wait in the studio.
        </p>
      ) : null}
      {activeStage === 'share' ? (
        <div className="grid max-w-md grid-cols-3 gap-2">
          {['Front', '3/4', 'Back'].map((label) => (
            <div
              key={label}
              className="flex aspect-[4/5] items-end justify-center border border-flv-line bg-flv-line/40 p-2 font-body text-xs tracking-[0.08em] text-flv-muted uppercase"
            >
              {label}
            </div>
          ))}
        </div>
      ) : null}
      {activeStage === 'vote' ? (
        <Link
          to="/vote"
          search={{}}
          className="flv-cta inline-flex min-h-12 w-fit items-center px-6 font-body text-xs tracking-[0.12em] uppercase"
        >
          {FLV_COPY.seeBoard}
        </Link>
      ) : null}
        {isCreateLandingStage(activeStage) ? (
          <Link
            to="/create"
            search={{
              step: activeStage,
              garment: garmentId,
              color: clothColor,
              neck,
              hem,
              sleeve,
            }}
            className="flv-cta inline-flex min-h-12 w-fit items-center px-6 font-body text-xs tracking-[0.12em] uppercase"
          >
            {FLV_COPY.openInStudio}
          </Link>
        ) : null}
    </section>
  )
}

function FitChip({
  label,
  pressed,
  onPress,
}: {
  label: string
  pressed: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        'min-h-11 border px-3 font-body text-xs tracking-[0.08em] uppercase',
        {
          'border-flv-accent text-flv-accent': pressed,
          'border-flv-line text-flv-muted hover:text-flv-accent': !pressed,
        },
      )}
    >
      {label}
    </button>
  )
}
