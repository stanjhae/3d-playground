import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { garmentStructural } from '../../lib/garments'

export function StructureRail() {
  const garmentId = useEditorStore((state) => state.garmentId)
  const neck = useEditorStore((state) => state.document.structural.neck ?? 'crew')
  const setNeck = useEditorStore((state) => state.setNeck)
  const fields = garmentStructural({ garmentId })

  if (fields.length === 0) {
    return null
  }

  return (
    <aside className="flex flex-wrap items-center gap-3">
      {fields.map((field) => (
        <nav key={field.id} aria-label={field.label} className="flex gap-3">
          {field.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setNeck({ neck: option.id })
              }}
              className={cn(
                'min-h-11 font-display text-xs tracking-[0.16em] uppercase',
                {
                  'text-brass': neck === option.id,
                  'text-ivory-muted hover:text-brass': neck !== option.id,
                },
              )}
            >
              {option.label}
            </button>
          ))}
        </nav>
      ))}
    </aside>
  )
}
