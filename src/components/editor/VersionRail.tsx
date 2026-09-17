import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

export function VersionRail() {
  const snapshots = useEditorStore((state) => state.snapshots)
  const rememberMorning = useEditorStore((state) => state.rememberMorning)
  const restoreMorning = useEditorStore((state) => state.restoreMorning)

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.thisHouse}</p>
      <nav className="flex flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain">
        <button
          type="button"
          onClick={() => {
            rememberMorning({ title: HOUSE_COPY.restoreMorning })
          }}
          className={cn(
            'min-h-11 shrink-0 text-ivory-muted hover:text-brass',
            chromeTextClass(),
          )}
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
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2 text-brass',
              chromeTextClass(),
            )}
          >
            {snapshot.still ? (
              <img
                src={snapshot.still}
                alt=""
                className="size-11 border border-atelier-line object-cover"
              />
            ) : null}
            {snapshot.title}
          </button>
        ))}
      </nav>
    </aside>
  )
}
