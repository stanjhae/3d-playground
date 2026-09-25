import { useMemo, useState } from 'react'

import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { cn } from '../../lib/cn'
import {
  getAvatarById,
  listAvatars,
  nextAvatarSelection,
  type AvatarFilter,
  type AvatarPreset,
} from '../../lib/avatars'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const FILTERS: { id: AvatarFilter | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'athletic', label: 'Athletic' },
]

type EnvPreview = 'studio' | 'outdoor'

const ENV_OPTIONS: { id: EnvPreview; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'outdoor', label: 'Outdoor' },
]

function AvatarSilhouette({
  avatar,
}: {
  avatar: AvatarPreset
}) {
  const soft =
    avatar.filters.includes('female') && !avatar.filters.includes('athletic')
  const broad = avatar.filters.includes('athletic') || avatar.chestCm >= 108
  const shoulder = broad ? 18 : soft ? 14 : 16
  const hip = soft ? 15 : broad ? 14 : 13
  const waistY = soft ? 42 : 40

  return (
    <svg
      viewBox="0 0 40 64"
      aria-hidden
      className="h-10 w-6 fill-current text-flv-muted"
    >
      <circle
        cx="20"
        cy="8"
        r="5.5"
      />
      <path
        d={`M${20 - shoulder} 16
          C${20 - shoulder} 16 ${20 - shoulder - 2} 28 ${20 - hip} ${waistY}
          L${20 - hip + 1} 58
          L${20 + hip - 1} 58
          L${20 + hip} ${waistY}
          C${20 + shoulder + 2} 28 ${20 + shoulder} 16 ${20 + shoulder} 16
          Z`}
      />
    </svg>
  )
}

export function visibleAvatarsForFilter({
  filter,
  selectedId,
}: {
  filter: AvatarFilter | 'all'
  selectedId?: string | null
}): AvatarPreset[] {
  const filtered = listAvatars({
    filter: filter === 'all' ? undefined : filter,
  })
  const selected = getAvatarById({ avatarId: selectedId })

  if (!selected || filtered.some((avatar) => avatar.id === selected.id)) {
    return filtered
  }

  return [selected, ...filtered]
}

export function AvatarRail() {
  const avatarId = useEditorStore((state) => state.avatarId)
  const createStep = useEditorStore((state) => state.createStep)
  const avatarMeasurements = useEditorStore((state) => state.avatarMeasurements)
  const setAvatarId = useEditorStore((state) => state.setAvatarId)
  const setAvatarMeasurements = useEditorStore(
    (state) => state.setAvatarMeasurements,
  )
  const resetAvatarMeasurements = useEditorStore(
    (state) => state.resetAvatarMeasurements,
  )
  const [filter, setFilter] = useState<AvatarFilter | 'all'>('all')
  const [envPreview, setEnvPreview] = useState<EnvPreview>('studio')
  const avatars = useMemo(
    () =>
      visibleAvatarsForFilter({
        filter,
        selectedId: avatarId,
      }),
    [avatarId, filter],
  )
  const selectedOutsideFilter =
    Boolean(avatarId) &&
    filter !== 'all' &&
    !listAvatars({ filter }).some((avatar) => avatar.id === avatarId)

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.avatar}</p>
      <p className={chromeMutedClass()}>{FLV_COPY.visualFitNote}</p>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Avatar filter"
      >
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={filter === entry.id}
            onClick={() => {
              setFilter(entry.id)
            }}
            className={cn('min-h-9 rounded-full border px-3', chromeTextClass(), {
              'border-flv-accent text-flv-accent': filter === entry.id,
              'border-flv-line text-flv-muted hover:text-flv-accent':
                filter !== entry.id,
            })}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {selectedOutsideFilter ? (
        <p className={chromeMutedClass()}>
          Current avatar is outside this filter — still selected above.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {avatars.map((avatar) => {
          const isCurrent = avatarId === avatar.id

          return (
            <button
              key={avatar.id}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => {
                const nextId = nextAvatarSelection({
                  currentId: avatarId,
                  clickedId: avatar.id,
                  createStep,
                })

                if (nextId === avatarId) {
                  return
                }

                setAvatarId({ avatarId: nextId })

                if (nextId) {
                  setAvatarMeasurements({
                    measurements: {
                      height: avatar.heightCm,
                      chest: avatar.chestCm,
                      waist: avatar.waistCm,
                    },
                  })
                }
              }}
              className={cn(
                'flex min-h-14 items-center gap-2 rounded-xl border px-2 py-2 text-left',
                {
                  'border-flv-accent text-flv-accent': isCurrent,
                  'border-flv-line text-flv-muted hover:text-flv-accent':
                    !isCurrent,
                },
              )}
            >
              <AvatarSilhouette avatar={avatar} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={chromeTextClass()}>{avatar.label}</span>
                <span className={chromeMutedClass()}>{avatar.heightCm} cm</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className={chromeKickerClass()}>Environment</p>
          <ConceptPreviewBadge />
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Environment preview"
        >
          {ENV_OPTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={envPreview === entry.id}
              onClick={() => {
                setEnvPreview(entry.id)
              }}
              className={cn(
                'min-h-9 rounded-full border px-3',
                chromeTextClass(),
                {
                  'border-flv-accent text-flv-accent': envPreview === entry.id,
                  'border-flv-line text-flv-muted hover:text-flv-accent':
                    envPreview !== entry.id,
                },
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <p className={chromeKickerClass()}>{HOUSE_COPY.measurements}</p>
      <MeasurementSlider
        label={HOUSE_COPY.height}
        value={avatarMeasurements.height}
        unit="cm"
        min={150}
        max={200}
        onChange={({ value }) => {
          setAvatarMeasurements({
            measurements: { height: value },
          })
        }}
      />
      <MeasurementSlider
        label={HOUSE_COPY.chest}
        value={avatarMeasurements.chest}
        unit="cm"
        min={80}
        max={120}
        onChange={({ value }) => {
          setAvatarMeasurements({
            measurements: { chest: value },
          })
        }}
      />
      <MeasurementSlider
        label={HOUSE_COPY.waist}
        value={avatarMeasurements.waist}
        unit="cm"
        min={60}
        max={110}
        onChange={({ value }) => {
          setAvatarMeasurements({
            measurements: { waist: value },
          })
        }}
      />
      <button
        type="button"
        onClick={() => {
          resetAvatarMeasurements()
        }}
        className={cn(
          'min-h-11 border border-flv-line px-3 text-flv-muted hover:text-flv-accent',
          chromeTextClass(),
        )}
      >
        {HOUSE_COPY.resetAvatar}
      </button>
    </aside>
  )
}

function MeasurementSlider({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  onChange: ({ value }: { value: number }) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between">
        <span className={cn('text-flv-muted', chromeTextClass())}>{label}</span>
        <span className="font-body text-xs text-flv-accent">
          {value} {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => {
          onChange({ value: Number(event.target.value) })
        }}
        className="accent-[var(--color-flv-accent)]"
      />
    </label>
  )
}
