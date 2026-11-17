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
 * The relief on chosen fabrics: each fabric's own (twill on denim, knit on
 * jersey), another one, or none. A view setting: it is not saved with the
 * design, so it needs no document change.
 */
export function SurfaceChooser() {
  const surface = useEditorStore((state) => state.surface)
  const setSurface = useEditorStore((state) => state.setSurface)

  return (
    <div role="group" aria-labelledby="surface-chooser-label" className="flex flex-col gap-2">
      <p id="surface-chooser-label" className={chromeKickerClass()}>
        {HOUSE_COPY.surface}
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
