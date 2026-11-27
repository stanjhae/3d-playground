import { Button } from '../ui/Button'
import { backToStepLabel, nextCreateStep, previousCreateStep, previousStepShortName } from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'

/**
 * The step's buttons, always in the same place at the end of the studio
 * bar: back, Skip where a step is optional, and the one primary action.
 * The publish step has no primary here: publishing is its action, in the
 * publish panel.
 */
export function StepActions() {
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)

  function go(next: typeof createStep) {
    setCreateStep({ createStep: next })
  }

  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5" data-hint-keep-clear>
      {createStep === 'select' ? null : (
        <Button
          variant="quiet"
          aria-label={backToStepLabel({ step: createStep })}
          title={backToStepLabel({ step: createStep })}
          // On a phone the step dots are the way back, and the bar keeps its room.
          className="px-2! max-sm:hidden"
          onClick={() => go(previousCreateStep({ step: createStep }))}
        >
          {/* "‹ Garment"; the full label is the button's name. */}
          <span aria-hidden className="whitespace-nowrap">
            ‹ {previousStepShortName({ step: createStep })}
          </span>
        </Button>
      )}
      {/* Skip goes where Continue does; it says the step is optional. A phone keeps only Continue. */}
      {createStep === 'color' ? (
        <Button variant="secondary" className="px-3! max-sm:hidden" onClick={() => go(nextCreateStep({ step: createStep }))}>
          {HOUSE_COPY.skip}
        </Button>
      ) : null}
      {createStep === 'share' ? null : (
        <Button arrow className="px-3! sm:px-4!" onClick={() => go(nextCreateStep({ step: createStep }))}>
          {createStep === 'select' ? FLV_COPY.selectUse : HOUSE_COPY.continue}
        </Button>
      )}
    </div>
  )
}
