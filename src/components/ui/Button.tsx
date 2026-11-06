import { ArrowRight } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'

export function buttonClass({
  variant = 'primary',
  wide = false,
}: {
  variant?: ButtonVariant
  wide?: boolean
} = {}) {
  return cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-body text-sm font-medium disabled:opacity-50',
    {
      'flv-cta': variant === 'primary',
      'border border-flv-line bg-white text-flv-ink hover:border-flv-ink': variant === 'secondary',
      'text-flv-muted underline-offset-2 hover:text-flv-ink hover:underline': variant === 'quiet',
      'w-full': wide,
    },
  )
}

export function Button({
  variant,
  wide,
  arrow = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  wide?: boolean
  arrow?: boolean
}) {
  return (
    <button type="button" {...props} className={cn(buttonClass({ variant, wide }), className)}>
      {children}
      {arrow ? <ArrowRight aria-hidden className="size-4" /> : null}
    </button>
  )
}
