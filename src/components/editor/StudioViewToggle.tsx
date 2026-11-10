import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'
import { RadioGroup } from '../ui/RadioGroup'

export function StudioViewToggle() {
  const studioView = useEditorStore((state) => state.studioView)
  const setStudioView = useEditorStore((state) => state.setStudioView)

  return (
    <RadioGroup
      as="nav"
      aria-label={HOUSE_COPY.studioView}
      data-hint-anchor="panels"
      className="flex gap-3 lg:hidden"
    >
      <button
        type="button"
        role="radio"
        aria-checked={studioView === 'draw'}
        onClick={() => {
          setStudioView({ studioView: 'draw' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-flv-accent': studioView === 'draw',
          'text-flv-muted': studioView !== 'draw',
        })}
      >
        {HOUSE_COPY.draw}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={studioView === 'cloth'}
        onClick={() => {
          setStudioView({ studioView: 'cloth' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-flv-accent': studioView === 'cloth',
          'text-flv-muted': studioView !== 'cloth',
        })}
      >
        {HOUSE_COPY.cloth}
      </button>
    </RadioGroup>
  )
}
