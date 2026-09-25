import { cn } from '../../lib/cn'
import {
  CREATE_STEPS,
  nextCreateStep,
} from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'

export function CreateStepper() {
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)

  return (
    <nav
      aria-label="Create steps"
      className="flex w-full max-w-full flex-wrap items-center gap-2 overflow-x-auto overscroll-x-contain"
    >
      {CREATE_STEPS.map((step, index) => {
        const isCurrent = createStep === step.id
        const currentIndex = CREATE_STEPS.findIndex(
          (entry) => entry.id === createStep,
        )
        const isPast = index < currentIndex

        return (
          <button
            key={step.id}
            type="button"
            aria-current={isCurrent ? 'step' : undefined}
            onClick={() => {
              setCreateStep({ createStep: step.id })
            }}
            className={cn('min-h-11 shrink-0', chromeTextClass(), {
              'text-brass': isCurrent,
              'text-ivory': isPast && !isCurrent,
              'text-ivory-muted hover:text-brass': !isCurrent && !isPast,
            })}
          >
            <span className="mr-1 text-brass/70">{index + 1}</span>
            {step.label}
          </button>
        )
      })}
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={createStep === 'share'}
          onClick={() => {
            setCreateStep({
              createStep: nextCreateStep({ step: createStep }),
            })
          }}
          className={cn(
            'min-h-11 border border-brass px-3 text-brass hover:bg-atelier disabled:opacity-40',
            chromeTextClass(),
          )}
        >
          {HOUSE_COPY.continue}
        </button>
      </div>
    </nav>
  )
}
