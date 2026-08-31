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
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          setMode({ mode: 'design' })
        }}
        className={
          current === 'design'
            ? 'border border-brass px-4 py-2 font-display text-xs tracking-[0.18em] text-brass uppercase'
            : 'border border-atelier-line px-4 py-2 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass'
        }
      >
        Design look
      </button>
      <button
        type="button"
        onClick={() => {
          setMode({ mode: 'atelier' })
        }}
        className={
          current === 'atelier'
            ? 'border border-brass px-4 py-2 font-display text-xs tracking-[0.18em] text-brass uppercase'
            : 'border border-atelier-line px-4 py-2 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass'
        }
      >
        Walk the atelier
      </button>
    </div>
  )
}
