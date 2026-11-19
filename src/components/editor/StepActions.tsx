import { Button } from '../ui/Button'
import { backToStepLabel, nextCreateStep, previousCreateStep, previousStepShortName } from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import { UndoRedo } from './UndoRedo'

/**
 * The step's one primary action, always in the same place. The publish step
 * has none here: publishing is its action, in the publish panel.
 */
export function StepActions() {
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)

  function go(next: typeof createStep) {
    setCreateStep({ createStep: next })
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-hint-keep-clear>
      {/* Undo sits with the step's buttons: one row instead of two on a phone. */}
      <div className="mr-auto">
        <UndoRedo />
      </div>
      {createStep === 'select' ? null : (
        <Button
          variant="quiet"
          aria-label={backToStepLabel({ step: createStep })}
          className="px-1! sm:px-5!"
          onClick={() => go(previousCreateStep({ step: createStep }))}
        >
          {/* A phone keeps the step's buttons on one row: "‹ Garment". */}
          <span aria-hidden className="sm:hidden">
            ‹ {previousStepShortName({ step: createStep })}
          </span>
          <span aria-hidden className="hidden sm:inline">
            {backToStepLabel({ step: createStep })}
          </span>
        </Button>
      )}
      {createStep === 'color' ? (
        <Button variant="secondary" onClick={() => go(nextCreateStep({ step: createStep }))}>
          {HOUSE_COPY.skip}
        </Button>
      ) : null}
      {createStep === 'share' ? null : (
        <Button arrow onClick={() => go(nextCreateStep({ step: createStep }))}>
          {createStep === 'select' ? FLV_COPY.selectUse : HOUSE_COPY.continue}
        </Button>
      )}
    </div>
  )
}
