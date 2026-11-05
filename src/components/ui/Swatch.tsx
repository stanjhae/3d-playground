import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

/** A colour choice. `name` is what a screen reader hears, never a hex value. */
export function Swatch({
  name,
  color,
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  name: string
  color: string
  selected: boolean
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={selected}
      title={name}
      {...props}
      className={cn(
        'size-11 rounded-full border border-black/10 ring-offset-2 ring-offset-white',
        { 'ring-2 ring-flv-accent': selected },
        className,
      )}
      style={{ backgroundColor: color }}
    />
  )
}
