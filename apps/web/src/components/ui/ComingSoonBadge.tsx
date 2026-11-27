import { cn } from '../../lib/cn'

/** Marks an option that isn't built yet, so nobody wonders why it won't select. */
export function ComingSoonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-flv-soft px-2 py-0.5 font-body text-[0.6rem] tracking-[0.12em] text-flv-muted uppercase',
        className,
      )}
    >
      Coming soon
    </span>
  )
}
