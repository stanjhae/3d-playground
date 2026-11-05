import { cn } from '../../lib/cn'

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  className,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** The value as a person reads it, such as "80%". */
  display?: string
  onChange: (next: number) => void
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1 font-body text-xs text-flv-muted', className)}>
      <span className="flex justify-between gap-2">
        {label}
        {display ? <span className="text-flv-ink">{display}</span> : null}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          onChange(Number.parseFloat(event.target.value))
        }}
        className="w-full accent-flv-accent"
      />
    </label>
  )
}
