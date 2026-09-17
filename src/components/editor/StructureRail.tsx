import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { garmentStructural } from '../../lib/garments'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

export function StructureRail() {
  const garmentId = useEditorStore((state) => state.garmentId)
  const structural = useEditorStore((state) => state.document.structural)
  const setStructural = useEditorStore((state) => state.setStructural)
  const fields = garmentStructural({ garmentId })

  if (fields.length === 0) {
    return null
  }

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.cut}</p>
      <div className="flex flex-wrap items-center gap-3">
        {fields.map((field) => {
          const selected =
            field.id === 'neck'
              ? (structural.neck ?? 'crew')
              : field.id === 'hem'
                ? (structural.hem ?? 'long')
                : (structural.sleeve ?? 'short')

          return (
            <nav key={field.id} aria-label={field.label} className="flex gap-3">
              {field.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setStructural({
                      structural: { [field.id]: option.id },
                    })
                  }}
                  className={cn('min-h-11', chromeTextClass(), {
                    'text-brass': selected === option.id,
                    'text-ivory-muted hover:text-brass': selected !== option.id,
                  })}
                >
                  {option.label}
                </button>
              ))}
            </nav>
          )
        })}
      </div>
    </aside>
  )
}
