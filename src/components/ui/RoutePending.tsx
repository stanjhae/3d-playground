import { LoaderCircle } from 'lucide-react'

/** Shown while a route guard is still working, so a page is never blank. */
export function RoutePending() {
  return (
    <div
      role="status"
      className="flex min-h-[60dvh] items-center justify-center gap-2 font-body text-sm text-flv-muted"
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      Opening…
    </div>
  )
}
