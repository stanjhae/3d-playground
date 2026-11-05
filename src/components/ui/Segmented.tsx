import { cn } from '../../lib/cn'

export type SegmentedOption<Value extends string> = {
  value: Value
  label: string
}

/** One choice from a few, as a radio group. */
export function Segmented<Value extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: ReadonlyArray<SegmentedOption<Value>>
  value: Value
  onChange: (next: Value) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex gap-1 rounded-full border border-flv-line bg-white p-1', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => {
            onChange(option.value)
          }}
          className={cn('min-h-9 rounded-full px-4 font-body text-sm', {
            'bg-flv-ink font-medium text-white': option.value === value,
            'text-flv-muted hover:text-flv-ink': option.value !== value,
          })}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
