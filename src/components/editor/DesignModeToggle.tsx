import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'

export function DesignModeToggle() {
  const designEditMode = useEditorStore((state) => state.designEditMode)
  const setDesignEditMode = useEditorStore((state) => state.setDesignEditMode)

  return (
    <nav
      aria-label={HOUSE_COPY.tech}
      className="flex gap-3 border border-atelier-line bg-atelier/92 px-3 py-2"
    >
      <button
        type="button"
        aria-pressed={designEditMode === 'draw'}
        onClick={() => {
          setDesignEditMode({ designEditMode: 'draw' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-brass': designEditMode === 'draw',
          'text-ivory-muted hover:text-brass': designEditMode !== 'draw',
        })}
      >
        {HOUSE_COPY.drawMode}
      </button>
      <button
        type="button"
        aria-pressed={designEditMode === 'tech'}
        onClick={() => {
          setDesignEditMode({ designEditMode: 'tech' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-brass': designEditMode === 'tech',
          'text-ivory-muted hover:text-brass': designEditMode !== 'tech',
        })}
      >
        {HOUSE_COPY.techMode}
      </button>
    </nav>
  )
}
