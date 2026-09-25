import { cn } from '../../lib/cn'
import { nextCreateStep } from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { garmentStructural } from '../../lib/garments'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  emptyStepClass,
  railFrameClass,
} from '../../lib/studio-chrome'

export function StructureRail() {
  const garmentId = useEditorStore((state) => state.garmentId)
  const structural = useEditorStore((state) => state.document.structural)
  const setStructural = useEditorStore((state) => state.setStructural)
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)
  const fields = garmentStructural({ garmentId })

  if (fields.length === 0) {
    return (
      <aside className={emptyStepClass()}>
        <p className={chromeKickerClass()}>{FLV_COPY.fitEmptyTitle}</p>
        <p className={chromeMutedClass()}>{FLV_COPY.fitEmptyLead}</p>
        <button
          type="button"
          onClick={() => {
            setCreateStep({
              createStep: nextCreateStep({ step: createStep }),
            })
          }}
          className="flv-cta inline-flex min-h-11 items-center justify-center px-4 font-body text-xs tracking-[0.12em] uppercase"
        >
          {HOUSE_COPY.skip} →
        </button>
      </aside>
    )
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
            <nav key={field.id} aria-label={field.label} className="flex gap-2">
              {field.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setStructural({
                      structural: { [field.id]: option.id },
                    })
                  }}
                  className={cn('min-h-11 border px-3', chromeTextClass(), {
                    'border-flv-accent text-flv-accent':
                      selected === option.id,
                    'border-flv-line text-flv-muted hover:text-flv-accent':
                      selected !== option.id,
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
