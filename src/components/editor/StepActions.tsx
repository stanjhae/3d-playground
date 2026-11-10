import { Button } from '../ui/Button'
import { nextCreateStep, previousCreateStep } from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'

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
      {createStep === 'select' ? null : (
        <Button variant="quiet" onClick={() => go(previousCreateStep({ step: createStep }))}>
          {HOUSE_COPY.previous}
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
