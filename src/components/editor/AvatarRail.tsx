import { useMemo, useState } from 'react'

import { cn } from '../../lib/cn'
import {
  getAvatarById,
  listAvatars,
  nextAvatarSelection,
  type AvatarFilter,
  type AvatarPreset,
} from '../../lib/avatars'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const FILTERS: { id: AvatarFilter | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'athletic', label: 'Athletic' },
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
      className="h-10 w-6 fill-current text-ivory-muted"
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
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={filter === entry.id}
            onClick={() => {
              setFilter(entry.id)
            }}
            className={cn('min-h-9 rounded-full border px-3', chromeTextClass(), {
              'border-brass text-brass': filter === entry.id,
              'border-atelier-line text-ivory-muted hover:text-brass':
                filter !== entry.id,
            })}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {selectedOutsideFilter ? (
        <p className="font-body text-xs text-ivory-muted">
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
                  'border-brass text-brass': isCurrent,
                  'border-atelier-line text-ivory-muted hover:text-brass':
                    !isCurrent,
                },
              )}
            >
              <AvatarSilhouette avatar={avatar} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={chromeTextClass()}>{avatar.label}</span>
                <span className="font-body text-xs text-ivory-muted">
                  {avatar.heightCm} cm
                </span>
              </span>
            </button>
          )
        })}
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
          'min-h-11 border border-atelier-line px-3 text-ivory-muted hover:text-brass',
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
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {label}
        </span>
        <span className="font-body text-xs text-brass">
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
        className="accent-brass"
      />
    </label>
  )
}
