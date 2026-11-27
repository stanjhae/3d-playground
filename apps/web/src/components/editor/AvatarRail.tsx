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
import { RadioGroup } from '../ui/RadioGroup'

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
  const setAvatarId = useEditorStore((state) => state.setAvatarId)
  const setAvatarMeasurements = useEditorStore(
    (state) => state.setAvatarMeasurements,
  )
  const [filter, setFilter] = useState<AvatarFilter | 'all'>('all')
  const studioEnv = useEditorStore((state) => state.studioEnv)
  const setStudioEnv = useEditorStore((state) => state.setStudioEnv)
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
      <RadioGroup
        className="flex flex-wrap gap-2"
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
      </RadioGroup>
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
                      hip: avatar.hipCm,
                      build: avatar.build,
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
        <RadioGroup
          className="flex flex-wrap gap-2"
          aria-label="Environment preview"
        >
          {ENV_OPTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={studioEnv === entry.id}
              onClick={() => {
                setStudioEnv({ studioEnv: entry.id })
              }}
              className={cn(
                'min-h-9 rounded-full border px-3',
                chromeTextClass(),
                {
                  'border-flv-accent text-flv-accent': studioEnv === entry.id,
                  'border-flv-line text-flv-muted hover:text-flv-accent':
                    studioEnv !== entry.id,
                },
              )}
            >
              {entry.label}
            </button>
          ))}
        </RadioGroup>
      </div>
    </aside>
  )
}
