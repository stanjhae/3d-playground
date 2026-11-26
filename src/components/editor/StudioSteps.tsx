import { Check } from 'lucide-react'

import { cn } from '../../lib/cn'
import { CREATE_STEPS } from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'

/**
 * The create steps as one slim row for the studio bar (studio mode,
 * 26 Nov): a numbered dot per step, the current step's name beside its
 * dot, and every name in view only where the bar has room (2xl). On a
 * phone the dots drop their connecting lines and keep a 32 px tap area:
 * they are the way back there. Each
 * button keeps the step's full name, so it reads and is found as before.
 */
export function StudioSteps({ className }: { className?: string }) {
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)
  const currentIndex = CREATE_STEPS.findIndex((step) => step.id === createStep)

  return (
    <nav aria-label="Create steps" className={className}>
      <ol className="flex items-center gap-1">
        {CREATE_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex
          const isDone = index < currentIndex

          return (
            <li key={step.id} className="flex items-center gap-1">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn('h-px w-4 max-sm:hidden', { 'bg-flv-ink': isDone || isCurrent, 'bg-flv-line': !isDone && !isCurrent })}
                />
              ) : null}
              <button
                type="button"
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => setCreateStep({ createStep: step.id })}
                className={cn(
                  'flex min-h-11 min-w-8 items-center justify-center gap-1.5 rounded-full font-body text-xs whitespace-nowrap focus-visible:bg-flv-soft sm:px-1 sm:text-sm',
                  { 'hover:bg-flv-soft': !isCurrent },
                )}
              >
                <span
                  className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-xs', {
                    'border-transparent bg-flv-accent font-medium text-white': isCurrent,
                    'border-flv-ink text-flv-ink': isDone,
                    'border-flv-line bg-white text-flv-muted': !isCurrent && !isDone,
                  })}
                >
                  {isDone ? <Check aria-hidden className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={cn({
                    // The current step's name shows from sm; the others only where the bar has room.
                    'font-medium text-flv-ink max-sm:sr-only': isCurrent,
                    'sr-only 2xl:not-sr-only 2xl:text-flv-muted': !isCurrent,
                  })}
                >
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
