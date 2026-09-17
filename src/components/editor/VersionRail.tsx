import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'

export function VersionRail() {
  const snapshots = useEditorStore((state) => state.snapshots)
  const rememberMorning = useEditorStore((state) => state.rememberMorning)
  const restoreMorning = useEditorStore((state) => state.restoreMorning)

  return (
    <aside className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          rememberMorning({ title: 'Morning' })
        }}
        className="min-h-11 font-display text-xs tracking-[0.16em] text-ivory-muted uppercase hover:text-brass"
      >
        {HOUSE_COPY.morning}
      </button>
      {snapshots.map((snapshot) => (
        <button
          key={snapshot.id}
          type="button"
          onClick={() => {
            restoreMorning({ snapshot })
          }}
          className="min-h-11 font-display text-xs tracking-[0.16em] text-brass uppercase"
        >
          {HOUSE_COPY.restoreMorning}
        </button>
      ))}
    </aside>
  )
}
