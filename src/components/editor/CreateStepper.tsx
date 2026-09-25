import { cn } from '../../lib/cn'
import {
  CREATE_STEPS,
  createStepIndex,
  nextCreateStep,
  previousCreateStep,
} from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'

export function CreateStepper() {
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)
  const currentIndex = createStepIndex({ step: createStep })
  const progress =
    CREATE_STEPS.length <= 1
      ? 1
      : currentIndex / Math.max(1, CREATE_STEPS.length - 1)

  return (
    <nav
      aria-label="Create steps"
      className="flex w-full max-w-full flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="relative h-px min-w-0 flex-1 bg-atelier-line">
          <div
            className="absolute inset-y-0 left-0 bg-brass"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={createStep === 'select'}
            onClick={() => {
              setCreateStep({
                createStep: previousCreateStep({ step: createStep }),
              })
            }}
            className={cn(
              'min-h-9 border border-atelier-line px-2.5 text-ivory-muted hover:text-brass disabled:opacity-40',
              chromeTextClass(),
            )}
          >
            {HOUSE_COPY.previous}
          </button>
          <button
            type="button"
            disabled={createStep === 'share'}
            onClick={() => {
              setCreateStep({
                createStep: nextCreateStep({ step: createStep }),
              })
            }}
            className={cn(
              'min-h-9 border border-brass px-2.5 text-brass hover:bg-atelier disabled:opacity-40',
              chromeTextClass(),
            )}
          >
            {HOUSE_COPY.continue}
          </button>
        </div>
      </div>
      <div className="flex w-full max-w-full flex-wrap items-center gap-x-2 gap-y-1 overflow-x-auto overscroll-x-contain">
        {CREATE_STEPS.map((step, index) => {
          const isCurrent = createStep === step.id
          const isPast = index < currentIndex

          return (
            <button
              key={step.id}
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => {
                setCreateStep({ createStep: step.id })
              }}
              className={cn('min-h-9 shrink-0', chromeTextClass(), {
                'text-brass': isCurrent,
                'text-ivory': isPast && !isCurrent,
                'text-ivory-muted hover:text-brass': !isCurrent && !isPast,
              })}
            >
              <span className="mr-1 text-[0.65rem] text-brass/70">
                {index + 1}
              </span>
              {step.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
