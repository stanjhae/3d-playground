import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'

export function VersionRail() {
  const snapshots = useEditorStore((state) => state.snapshots)
  const rememberMorning = useEditorStore((state) => state.rememberMorning)
  const restoreMorning = useEditorStore((state) => state.restoreMorning)

  return (
    <aside className="flex flex-col gap-3">
      <p className="font-display text-xs tracking-[0.22em] text-brass uppercase">
        {HOUSE_COPY.thisHouse}
      </p>
      <nav className="flex flex-wrap items-center gap-3">
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
            className="flex min-h-11 items-center gap-2 font-display text-xs tracking-[0.16em] text-brass uppercase"
          >
            {snapshot.still ? (
              <img
                src={snapshot.still}
                alt=""
                className="size-8 border border-atelier-line object-cover"
              />
            ) : null}
            {snapshot.title}
          </button>
        ))}
      </nav>
    </aside>
  )
}
