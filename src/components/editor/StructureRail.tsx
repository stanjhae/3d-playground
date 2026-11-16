import { lazy, Suspense } from 'react'

import { cn } from '../../lib/cn'
import { nextCreateStep } from '../../lib/create-steps'
import { useCanEditShape, useEditorStore, usePatternAvailable } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { garmentStructural } from '../../lib/garments'
import { HOUSE_COPY } from '../../lib/house-copy'
import { PatternSwitch } from '../pattern/PatternSwitch'
import { ShapeRail } from './ShapeRail'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  emptyStepClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const PatternEditor = lazy(() => import('../pattern/PatternEditor'))

export function StructureRail() {
  const garmentId = useEditorStore((state) => state.garmentId)
  const structural = useEditorStore((state) => state.document.structural)
  const setStructural = useEditorStore((state) => state.setStructural)
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)
  const fields = garmentStructural({ garmentId })
  const shaped = useCanEditShape()
  const patternable = usePatternAvailable()
  const inPattern = useEditorStore((state) => Boolean(state.document.pattern))

  // Pattern (beta): the switch, then the pattern editor in place of the sliders.
  if (patternable) {
    return (
      <div className="flex flex-col gap-3">
        <PatternSwitch />
        {inPattern ? (
          <Suspense fallback={<p className={chromeMutedClass()}>Opening the pattern…</p>}>
            <PatternEditor />
          </Suspense>
        ) : shaped ? (
          <ShapeRail />
        ) : null}
      </div>
    )
  }

  // A model with a shape map gets sliders in place of the crew/v, crop/long toggles.
  if (shaped) {
    return <ShapeRail />
  }

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
          className="flv-cta inline-flex min-h-11 items-center justify-center px-4 font-body text-sm font-medium"
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
