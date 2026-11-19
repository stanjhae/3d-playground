import { useState } from 'react'

import { cn } from '../../lib/cn'
import { isCanonicalGarment } from '../../lib/concept-flags'
import type { FillPattern } from '../../lib/canonical-document'
import { layerPlacement, useEditorStore } from '../../lib/editor-store'
import { garmentPanels } from '../../lib/garments'
import { isLockedLayer } from '../../lib/design-document'
import { layerVoice } from '../../lib/layer-hit'
import { announce } from '../../lib/studio-announcer'
import { chromeKickerClass, chromeMutedClass, chromeTextClass } from '../../lib/studio-chrome'
import { FillColours } from './FillColours'

const buttonClass = cn(
  'min-h-11 flex-1 border border-flv-line px-3 text-flv-ink hover:border-flv-accent hover:text-flv-accent disabled:opacity-50',
  chromeTextClass(),
)

const PATTERNS: { id: FillPattern; label: string }[] = [
  { id: 'stripes', label: 'Stripes' },
  { id: 'check', label: 'Check' },
]

/**
 * Pattern on a whole side (writer W): one click covers the side being
 * worked on (front, back or a sleeve) with a repeat, or "All sides" covers
 * every one as a single undo step. The repeat is the selected graphic or
 * upload, which becomes the fill, or stripes or a check in two colours.
 * The new fill is selected, so its tile, turn and colours show in the
 * inspector; it sits in the layer list like any layer.
 */
export function SectionFill() {
  const garmentId = useEditorStore((state) => state.garmentId)
  const paintPanel = useEditorStore((state) => state.paintPanel)
  const selected = useEditorStore((state) => state.document.layers.find((layer) => layer.id === state.selectedLayerId))
  const addSectionFill = useEditorStore((state) => state.addSectionFill)
  const [pattern, setPattern] = useState<FillPattern>('stripes')
  const [colors, setColors] = useState<[string, string]>(['#f7f3ea', '#1a1c22'])

  if (!isCanonicalGarment({ garmentId })) {
    return null
  }

  const panels = garmentPanels({ garmentId })
  const sideLabel = (panels.find((panel) => panel.id === paintPanel)?.label ?? 'Front').toLowerCase()
  const image = selected?.kind === 'graphic' && selected.src && !selected.missing && !isLockedLayer({ layer: selected }) ? selected : null
  const imageSide = image ? (panels.find((panel) => panel.id === image.panel)?.label ?? 'front').toLowerCase() : sideLabel

  function fill({ sides, source }: { sides: 'this' | 'all'; source: Parameters<typeof addSectionFill>[0]['source'] }) {
    const ids = addSectionFill({ source, sides })

    if (ids.length > 0) {
      const what = source.kind === 'image' ? 'Image fill' : source.pattern === 'check' ? 'Check fill' : 'Stripe fill'
      // The fill went under what was there (tester pass 3): say so, so
      // nobody hunts for layers it might have covered.
      const placed = sides === 'this' ? layerPlacement({ layerId: ids[0]! }) : null
      const above = placed ? placed.count - placed.index - 1 : 0
      const under = above > 0 ? `, under its ${above === 1 ? 'layer' : `${above} layers`}` : ''
      announce({
        message:
          sides === 'all'
            ? `${what} added to every side, under what is already there. Undo removes them all.`
            : `${what} added to the ${source.kind === 'image' ? imageSide : sideLabel}${under}. Set its tile size under Selected item.`,
      })
    }
  }

  return (
    <section aria-labelledby="section-fill-title" className="flex flex-col gap-3 border-t border-flv-line pt-3" data-testid="section-fill">
      <h3 id="section-fill-title" className={chromeKickerClass()}>
        Fill a whole side
      </h3>
      {image ? (
        <div role="group" aria-label="Repeat the selected graphic" className="flex flex-col gap-2">
          <p className={chromeMutedClass()}>
            Repeat {layerVoice({ layer: image }) === 'Image' ? 'the selected image' : `“${layerVoice({ layer: image })}”`} over the{' '}
            {imageSide}, or every side. It replaces the single graphic and goes under everything else there.
          </p>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} onClick={() => fill({ sides: 'this', source: { kind: 'image', replaceLayerId: image.id } })}>
              Fill this side
            </button>
            <button type="button" className={buttonClass} onClick={() => fill({ sides: 'all', source: { kind: 'image', replaceLayerId: image.id } })}>
              All sides
            </button>
          </div>
        </div>
      ) : (
        <p className={chromeMutedClass()}>Pick a graphic below, then repeat it over a whole side.</p>
      )}
      <div role="group" aria-label="Patterns" className="flex flex-col gap-2">
        <p className={chromeMutedClass()}>Patterns, on the {sideLabel} or every side, under what is already there</p>
        <div className="flex gap-2">
          {PATTERNS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={pattern === entry.id}
              onClick={() => setPattern(entry.id)}
              className={cn('min-h-11 flex-1 rounded-xl border px-3', chromeTextClass(), {
                'border-flv-accent text-flv-accent': pattern === entry.id,
                'border-flv-line text-flv-muted hover:text-flv-accent': pattern !== entry.id,
              })}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <FillColours colors={colors} inkLabel={pattern === 'check' ? 'Squares' : 'Stripes'} onChange={({ colors: next }) => setColors(next)} />
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={() => fill({ sides: 'this', source: { kind: 'pattern', pattern, colors } })}>
            Fill this side
          </button>
          <button type="button" className={buttonClass} onClick={() => fill({ sides: 'all', source: { kind: 'pattern', pattern, colors } })}>
            All sides
          </button>
        </div>
      </div>
    </section>
  )
}

export default SectionFill
