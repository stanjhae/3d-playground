import { cn } from '../../lib/cn'
import { useEditorStore, type EditorMode } from '../../lib/editor-store'

export function ModeToggle({
  mode,
}: {
  mode?: EditorMode
}) {
  const storeMode = useEditorStore((state) => state.mode)
  const setMode = useEditorStore((state) => state.setMode)
  const current = mode ?? storeMode

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        aria-pressed={current === 'design' ? 'true' : 'false'}
        onClick={() => {
          setMode({ mode: 'design' })
        }}
        className={cn(
          'min-h-11 font-display text-xs tracking-[0.18em] uppercase',
          {
            'text-brass': current === 'design',
            'text-ivory-muted hover:text-brass': current !== 'design',
          },
        )}
      >
        Design
      </button>
      <button
        type="button"
        aria-pressed={current === 'atelier' ? 'true' : 'false'}
        onClick={() => {
          setMode({ mode: 'atelier' })
        }}
        className={cn(
          'min-h-11 font-display text-xs tracking-[0.18em] uppercase',
          {
            'text-brass': current === 'atelier',
            'text-ivory-muted hover:text-brass': current !== 'atelier',
          },
        )}
      >
        The house
      </button>
    </div>
  )
}
