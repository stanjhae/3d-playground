import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

/** A rail or toolbar tool: icon over a short word, always labelled. */
export function ToolButton({
  icon: Icon,
  label,
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  selected: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={cn(
        'flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 font-body text-xs',
        {
          'bg-flv-soft font-medium text-flv-accent': selected,
          'text-flv-muted hover:bg-flv-soft hover:text-flv-ink': !selected,
        },
        className,
      )}
    >
      <Icon aria-hidden className="size-5" />
      {label}
    </button>
  )
}
