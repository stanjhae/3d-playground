import { cn } from '../../lib/cn'
import { useEditorStore, type EditorMode } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'

export function ModeToggle({
  mode,
}: {
  mode?: EditorMode
}) {
  const storeMode = useEditorStore((state) => state.mode)
  const setMode = useEditorStore((state) => state.setMode)
  const current = mode ?? storeMode

  return (
    <nav aria-label={HOUSE_COPY.design} className="flex flex-wrap gap-3">
      <button
        type="button"
        aria-pressed={current === 'design'}
        onClick={() => {
          setMode({ mode: 'design' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-brass': current === 'design',
          'text-ivory-muted hover:text-brass': current !== 'design',
        })}
      >
        {HOUSE_COPY.design}
      </button>
      <button
        type="button"
        aria-pressed={current === 'atelier'}
        onClick={() => {
          setMode({ mode: 'atelier' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-brass': current === 'atelier',
          'text-ivory-muted hover:text-brass': current !== 'atelier',
        })}
      >
        {HOUSE_COPY.theHouse}
      </button>
    </nav>
  )
}
