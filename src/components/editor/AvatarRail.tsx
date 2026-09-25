import { cn } from '../../lib/cn'
import {
  listAvatars,
  nextAvatarSelection,
  type AvatarPreset,
} from '../../lib/avatars'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

function AvatarSilhouette({
  avatar,
}: {
  avatar: AvatarPreset
}) {
  const soft = avatar.filters.includes('female') && !avatar.filters.includes('athletic')
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
      <circle cx="20" cy="8" r="5.5" />
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
  const avatars = listAvatars()

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.avatar}</p>
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
                'flex min-h-14 items-center gap-2 border px-2 py-2 text-left',
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
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.height}
        </span>
        <input
          type="range"
          min={150}
          max={200}
          step={1}
          value={avatarMeasurements.height}
          onChange={(event) => {
            setAvatarMeasurements({
              measurements: { height: Number(event.target.value) },
            })
          }}
          className="accent-brass"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.chest}
        </span>
        <input
          type="range"
          min={80}
          max={120}
          step={1}
          value={avatarMeasurements.chest}
          onChange={(event) => {
            setAvatarMeasurements({
              measurements: { chest: Number(event.target.value) },
            })
          }}
          className="accent-brass"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.waist}
        </span>
        <input
          type="range"
          min={60}
          max={110}
          step={1}
          value={avatarMeasurements.waist}
          onChange={(event) => {
            setAvatarMeasurements({
              measurements: { waist: Number(event.target.value) },
            })
          }}
          className="accent-brass"
        />
      </label>
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
