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
        onClick={() => {
          setMode({ mode: 'design' })
        }}
        className={
          current === 'design'
            ? 'min-h-11 font-display text-xs tracking-[0.18em] text-brass uppercase'
            : 'min-h-11 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass'
        }
      >
        Design
      </button>
      <button
        type="button"
        onClick={() => {
          setMode({ mode: 'atelier' })
        }}
        className={
          current === 'atelier'
            ? 'min-h-11 font-display text-xs tracking-[0.18em] text-brass uppercase'
            : 'min-h-11 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass'
        }
      >
        The house
      </button>
    </div>
  )
}
