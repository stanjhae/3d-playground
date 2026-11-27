import { cn } from './cn'

/**
 * A main-nav link. The current page is marked by colour and an underline,
 * as the steps bar marks its step, so it reads without relying on colour.
 */
export function navLinkClass({ active }: { active: boolean }) {
  return cn('inline-flex min-h-11 items-center border-b-2 px-1', {
    'border-flv-accent font-medium text-flv-accent': active,
    'border-transparent text-flv-muted hover:text-flv-accent': !active,
  })
}
