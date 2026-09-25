import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { cn } from '../../lib/cn'
import {
  BASE_FINISH_PRESETS,
  useEditorStore,
  type BasePatternId,
} from '../../lib/editor-store'
import { getFabricById } from '../../lib/fabrics'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import { INK_COLORS } from '../../lib/paint-colors'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const PATTERN_OPTIONS: { id: BasePatternId; label: string }[] = [
  { id: 'solid', label: HOUSE_COPY.solid },
  { id: 'stripe', label: HOUSE_COPY.stripe },
  { id: 'check', label: HOUSE_COPY.check },
  { id: 'gradient', label: HOUSE_COPY.gradient },
]

function finishLacksRealMap({ fabricId }: { fabricId: string }) {
  const fabric = getFabricById({ id: fabricId })
  return !fabric?.mapId
}

export function ColorPatternPanel() {
  const basePatternId = useEditorStore((state) => state.basePatternId)
  const baseFinishId = useEditorStore((state) => state.baseFinishId)
  const applyBaseColor = useEditorStore((state) => state.applyBaseColor)
  const setBasePattern = useEditorStore((state) => state.setBasePattern)
  const setBaseFinish = useEditorStore((state) => state.setBaseFinish)
  const applyFabric = useEditorStore((state) => state.applyFabric)
  const undoLast = useEditorStore((state) => state.undoLast)
  const redoLast = useEditorStore((state) => state.redoLast)
  const canUndo = useEditorStore((state) => state.undoCount > 0)
  const canRedo = useEditorStore((state) => state.redoCount > 0)
  const fabricId = useEditorStore((state) => state.fabricId)
  const overrides = useEditorStore((state) => state.overrides)
  const finish = BASE_FINISH_PRESETS.find((entry) => entry.id === baseFinishId)
  const activeFabric =
    getFabricById({ id: fabricId ?? finish?.fabricId ?? 'cotton' }) ??
    getFabricById({ id: 'cotton' })
  const activeColor =
    overrides.find((entry) => entry.meshName === 'body')?.color ??
    activeFabric?.color
  const conceptFinishes = BASE_FINISH_PRESETS.filter((entry) =>
    finishLacksRealMap({ fabricId: entry.fabricId }),
  )

  return (
    <aside className={cn(railFrameClass(), 'gap-4 lg:max-w-80')}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.baseColor}</p>
      <div className="grid grid-cols-4 gap-2">
        {INK_COLORS.map((ink) => {
          const pressed =
            activeColor?.toLowerCase() === ink.value.toLowerCase()

          return (
            <button
              key={ink.id}
              type="button"
              aria-label={ink.name}
              aria-pressed={pressed}
              onClick={() => {
                applyBaseColor({ color: ink.value })
              }}
              className={cn('aspect-square rounded-full border-2', {
                'border-flv-accent': pressed,
                'border-flv-line': !pressed,
              })}
              style={{ backgroundColor: ink.value }}
            />
          )
        })}
      </div>
      <p className={chromeKickerClass()}>{HOUSE_COPY.patternFill}</p>
      <div className="grid grid-cols-2 gap-2">
        {PATTERN_OPTIONS.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            aria-pressed={basePatternId === pattern.id}
            onClick={() => {
              setBasePattern({ patternId: pattern.id })
            }}
            className={cn(
              'relative flex min-h-14 items-end rounded-xl border px-2 py-2',
              chromeTextClass(),
              {
                'border-flv-accent text-flv-accent':
                  basePatternId === pattern.id,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  basePatternId !== pattern.id,
              },
            )}
          >
            {basePatternId === pattern.id ? (
              <span className="absolute top-1 right-1 text-flv-accent">✓</span>
            ) : null}
            {pattern.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={chromeKickerClass()}>{HOUSE_COPY.finish}</p>
        {conceptFinishes.length > 0 ? <ConceptPreviewBadge /> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {BASE_FINISH_PRESETS.map((finishOption) => (
          <button
            key={finishOption.id}
            type="button"
            aria-pressed={baseFinishId === finishOption.id}
            onClick={() => {
              setBaseFinish({ finishId: finishOption.id })
            }}
            className={cn(
              'relative flex min-h-12 items-end rounded-xl border px-2 py-2',
              chromeTextClass(),
              {
                'border-flv-accent text-flv-accent':
                  baseFinishId === finishOption.id,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  baseFinishId !== finishOption.id,
              },
            )}
          >
            {baseFinishId === finishOption.id ? (
              <span className="absolute top-1 right-1 text-flv-accent">✓</span>
            ) : null}
            {finishOption.label}
          </button>
        ))}
      </div>
      {activeFabric ? (
        <div className="flex flex-col gap-2 rounded-xl border border-flv-line p-3">
          <div
            className="aspect-[5/3] rounded-lg border border-flv-line"
            style={{ backgroundColor: activeFabric.color }}
          />
          <p className={chromeKickerClass()}>{FLV_COPY.colorMaterial}</p>
          <p className="font-body text-sm text-flv-ink">{activeFabric.name}</p>
          <ul className="flex flex-col gap-1 font-body text-xs text-flv-muted">
            <li>Roughness {activeFabric.roughness.toFixed(2)}</li>
            <li>Metalness {activeFabric.metalness.toFixed(2)}</li>
            {activeFabric.mapId ? <li>Map {activeFabric.mapId}</li> : null}
          </ul>
        </div>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => {
            undoLast()
          }}
          className={cn(
            'min-h-11 text-flv-muted hover:text-flv-accent disabled:opacity-30',
            chromeTextClass(),
          )}
        >
          {HOUSE_COPY.undo}
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={() => {
            redoLast()
          }}
          className={cn(
            'min-h-11 text-flv-muted hover:text-flv-accent disabled:opacity-30',
            chromeTextClass(),
          )}
        >
          {HOUSE_COPY.redo}
        </button>
        {fabricId ? (
          <button
            type="button"
            onClick={() => {
              applyFabric({ fabricId, colorId: fabricId })
            }}
            className={cn(
              'min-h-11 text-flv-muted hover:text-flv-accent',
              chromeTextClass(),
            )}
          >
            {HOUSE_COPY.cloth}
          </button>
        ) : null}
      </div>
    </aside>
  )
}
