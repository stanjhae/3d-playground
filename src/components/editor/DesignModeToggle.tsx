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
      className="flex gap-3 rounded-xl border border-flv-line bg-flv-paper/92 px-3 py-2"
      role="radiogroup"
    >
      <button
        type="button"
        role="radio"
        aria-checked={designEditMode === 'draw'}
        onClick={() => {
          setDesignEditMode({ designEditMode: 'draw' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-flv-accent': designEditMode === 'draw',
          'text-flv-muted hover:text-flv-accent': designEditMode !== 'draw',
        })}
      >
        {HOUSE_COPY.drawMode}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={designEditMode === 'tech'}
        onClick={() => {
          setDesignEditMode({ designEditMode: 'tech' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-flv-accent': designEditMode === 'tech',
          'text-flv-muted hover:text-flv-accent': designEditMode !== 'tech',
        })}
      >
        {HOUSE_COPY.techMode}
      </button>
    </nav>
  )
}
