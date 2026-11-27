import { cn } from '../../lib/cn'
import { useEditorStore, type EditorMode } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'
import { RadioGroup } from '../ui/RadioGroup'

export function ModeToggle({
  mode,
}: {
  mode?: EditorMode
}) {
  const storeMode = useEditorStore((state) => state.mode)
  const setMode = useEditorStore((state) => state.setMode)
  const current = mode ?? storeMode

  return (
    <RadioGroup
      as="nav"
      aria-label={HOUSE_COPY.design}
      className="flex flex-wrap gap-3"
    >
      <button
        type="button"
        role="radio"
        aria-checked={current === 'design'}
        onClick={() => {
          setMode({ mode: 'design' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-flv-accent': current === 'design',
          'text-flv-muted hover:text-flv-accent': current !== 'design',
        })}
      >
        {HOUSE_COPY.design}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={current === 'atelier'}
        onClick={() => {
          setMode({ mode: 'atelier' })
        }}
        className={cn('min-h-11', chromeTextClass(), {
          'text-flv-accent': current === 'atelier',
          'text-flv-muted hover:text-flv-accent': current !== 'atelier',
        })}
      >
        {HOUSE_COPY.theHouse}
      </button>
    </RadioGroup>
  )
}
