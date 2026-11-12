import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'

function historyButtonClass() {
  return cn(
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 px-2 text-flv-muted hover:text-flv-accent disabled:opacity-30 disabled:hover:text-flv-muted',
    chromeTextClass(),
  )
}

/**
 * Undo and Redo in the studio header, on every step and screen size: the
 * stack always existed, but phones had no key to reach it.
 */
export function UndoRedo() {
  const undoLast = useEditorStore((state) => state.undoLast)
  const redoLast = useEditorStore((state) => state.redoLast)
  const canUndo = useEditorStore((state) => state.undoCount > 0)
  const canRedo = useEditorStore((state) => state.redoCount > 0)

  return (
    <div className="flex items-center" role="group" aria-label={HOUSE_COPY.history}>
      <button
        type="button"
        disabled={!canUndo}
        onClick={() => {
          undoLast()
        }}
        aria-label={HOUSE_COPY.undo}
        title={HOUSE_COPY.undo}
        className={historyButtonClass()}
      >
        <span aria-hidden="true">↶</span>
        <span className="hidden sm:inline">{HOUSE_COPY.undo}</span>
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={() => {
          redoLast()
        }}
        aria-label={HOUSE_COPY.redo}
        title={HOUSE_COPY.redo}
        className={historyButtonClass()}
      >
        <span aria-hidden="true">↷</span>
        <span className="hidden sm:inline">{HOUSE_COPY.redo}</span>
      </button>
    </div>
  )
}
