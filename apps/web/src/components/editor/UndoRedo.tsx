import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'
import { historyShortcuts } from '../../lib/studio-keys'
import { ShortcutsButton, ShortcutsDialog } from './KeyboardHelp'

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
  const keys = historyShortcuts()

  return (
    <div className="flex items-center">
    <div className="flex items-center" role="group" aria-label={HOUSE_COPY.history}>
      <button
        type="button"
        disabled={!canUndo}
        onClick={() => {
          undoLast()
        }}
        aria-label={HOUSE_COPY.undo}
        aria-keyshortcuts={keys.undoAria}
        title={`${HOUSE_COPY.undo} (${keys.undo})`}
        className={historyButtonClass()}
      >
        <span aria-hidden="true">↶</span>
        <span className="hidden sm:inline lg:hidden xl:inline">{HOUSE_COPY.undo}</span>
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={() => {
          redoLast()
        }}
        aria-label={HOUSE_COPY.redo}
        aria-keyshortcuts={keys.redoAria}
        title={`${HOUSE_COPY.redo} (${keys.redo})`}
        className={historyButtonClass()}
      >
        <span aria-hidden="true">↷</span>
        <span className="hidden sm:inline lg:hidden xl:inline">{HOUSE_COPY.redo}</span>
      </button>
    </div>
      {/* The shortcuts sit with the history keys; ? opens the same dialog.
          Hidden on a phone: there is rarely a keyboard, and the room keeps
          Continue on the same row as the other step buttons. */}
      <ShortcutsButton className="max-md:hidden" />
      <ShortcutsDialog />
    </div>
  )
}
