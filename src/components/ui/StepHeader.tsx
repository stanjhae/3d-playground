import { Check } from 'lucide-react'

import { cn } from '../../lib/cn'

export type StepHeaderStep<Id extends string> = {
  id: Id
  label: string
}

/** The numbered progress row: done steps tick, the current one is filled. */
export function StepHeader<Id extends string>({
  steps,
  current,
  onSelect,
  label,
  className,
}: {
  steps: ReadonlyArray<StepHeaderStep<Id>>
  current: Id
  onSelect: (id: Id) => void
  label: string
  className?: string
}) {
  const currentIndex = steps.findIndex((step) => step.id === current)

  return (
    <nav aria-label={label} className={className}>
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex
          const isDone = index < currentIndex

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-start last:flex-none">
              <button
                type="button"
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => {
                  onSelect(step.id)
                }}
                className="flex min-h-11 w-20 shrink-0 flex-col items-center gap-1 text-center font-body text-xs leading-tight"
              >
                <span
                  className={cn('flex size-7 items-center justify-center rounded-full border text-xs', {
                    'border-transparent bg-flv-accent font-medium text-white': isCurrent,
                    'border-flv-ink text-flv-ink': isDone,
                    'border-flv-line bg-white text-flv-muted': !isCurrent && !isDone,
                  })}
                >
                  {isDone ? <Check aria-hidden className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={cn({
                    'font-medium text-flv-accent': isCurrent,
                    'text-flv-ink': isDone,
                    'text-flv-muted': !isCurrent && !isDone,
                  })}
                >
                  {step.label}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn('mt-3.5 h-px min-w-1 flex-1', {
                    'bg-flv-ink': isDone,
                    'bg-flv-line': !isDone,
                  })}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
