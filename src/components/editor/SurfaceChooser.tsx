import { cn } from '../../lib/cn'
import { DETAIL_LABELS, SURFACE_CHOICES, type SurfaceChoice } from '../../lib/fabric-detail'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'

function surfaceLabel({ surface }: { surface: SurfaceChoice }) {
  if (surface === 'preset') {
    return 'Fabric’s own'
  }

  if (surface === 'none') {
    return 'None'
  }

  return DETAIL_LABELS[surface]
}

/**
 * The relief of the cloth: each fabric's own (twill on denim, knit on
 * jersey), another one, or none; on a plain garment, its knit or another. A view setting: it is not saved with the
 * design, so it needs no document change.
 */
export function SurfaceChooser() {
  const surface = useEditorStore((state) => state.surface)
  const setSurface = useEditorStore((state) => state.setSurface)

  return (
    <div role="group" aria-labelledby="surface-chooser-label" aria-describedby="surface-chooser-hint" className="flex flex-col gap-2 border-t border-flv-line pt-4">
      <p id="surface-chooser-label" className={chromeKickerClass()}>
        {HOUSE_COPY.surface}
      </p>
      <p id="surface-chooser-hint" className="font-body text-xs text-flv-muted">
        {HOUSE_COPY.surfaceHint}
      </p>
      <div className="flex flex-wrap gap-2">
        {SURFACE_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={surface === choice}
            onClick={() => {
              setSurface({ surface: choice })
            }}
            className={cn('min-h-11 rounded-xl border px-3 py-1.5', chromeTextClass(), {
              'border-flv-accent text-flv-accent': surface === choice,
              'border-flv-line text-flv-muted hover:text-flv-accent': surface !== choice,
            })}
          >
            {surfaceLabel({ surface: choice })}
          </button>
        ))}
      </div>
    </div>
  )
}
