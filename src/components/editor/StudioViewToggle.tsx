import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'

export function StudioViewToggle() {
  const studioView = useEditorStore((state) => state.studioView)
  const setStudioView = useEditorStore((state) => state.setStudioView)

  return (
    <nav
      aria-label={HOUSE_COPY.studioView}
      className="flex gap-3 lg:hidden"
    >
      <button
        type="button"
        aria-pressed={studioView === 'draw'}
        onClick={() => {
          setStudioView({ studioView: 'draw' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-brass': studioView === 'draw',
          'text-ivory-muted': studioView !== 'draw',
        })}
      >
        {HOUSE_COPY.draw}
      </button>
      <button
        type="button"
        aria-pressed={studioView === 'cloth'}
        onClick={() => {
          setStudioView({ studioView: 'cloth' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-brass': studioView === 'cloth',
          'text-ivory-muted': studioView !== 'cloth',
        })}
      >
        {HOUSE_COPY.cloth}
      </button>
    </nav>
  )
}
