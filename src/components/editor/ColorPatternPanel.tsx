import { cn } from '../../lib/cn'
import {
  BASE_FINISH_PRESETS,
  useEditorStore,
  type BasePatternId,
} from '../../lib/editor-store'
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

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.baseColor}</p>
      <div className="flex flex-wrap gap-2">
        {INK_COLORS.map((ink) => (
          <button
            key={ink.id}
            type="button"
            aria-label={ink.name}
            onClick={() => {
              applyBaseColor({ color: ink.value })
            }}
            className="h-8 w-8 border border-atelier-line"
            style={{ backgroundColor: ink.value }}
          />
        ))}
      </div>
      <p className={chromeKickerClass()}>{HOUSE_COPY.patternFill}</p>
      <div className="flex flex-wrap gap-2">
        {PATTERN_OPTIONS.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            aria-pressed={basePatternId === pattern.id}
            onClick={() => {
              setBasePattern({ patternId: pattern.id })
            }}
            className={cn('min-h-11', chromeTextClass(), {
              'text-brass': basePatternId === pattern.id,
              'text-ivory-muted hover:text-brass': basePatternId !== pattern.id,
            })}
          >
            {pattern.label}
          </button>
        ))}
      </div>
      <p className={chromeKickerClass()}>{HOUSE_COPY.finish}</p>
      <div className="flex flex-wrap gap-2">
        {BASE_FINISH_PRESETS.map((finish) => (
          <button
            key={finish.id}
            type="button"
            aria-pressed={baseFinishId === finish.id}
            onClick={() => {
              setBaseFinish({ finishId: finish.id })
            }}
            className={cn('min-h-11', chromeTextClass(), {
              'text-brass': baseFinishId === finish.id,
              'text-ivory-muted hover:text-brass': baseFinishId !== finish.id,
            })}
          >
            {finish.label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => {
            undoLast()
          }}
          className={cn(
            'min-h-11 text-ivory-muted hover:text-brass disabled:opacity-30',
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
            'min-h-11 text-ivory-muted hover:text-brass disabled:opacity-30',
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
              'min-h-11 text-ivory-muted hover:text-brass',
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
