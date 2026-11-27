import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

/** After this long, the wait says what's happening and offers a retry. */
export const ROUTE_PENDING_SLOW_MS = 6_000

/**
 * Shown while a route guard is still working, so a page is never blank. A
 * slow sign-in refresh keeps waiting rather than sending a signed-in person
 * to sign in; after a while it says so.
 */
export function RoutePending() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), ROUTE_PENDING_SLOW_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div
      role="status"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center font-body text-sm text-flv-muted"
    >
      <span className="flex items-center gap-2">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Opening…
      </span>
      {slow ? (
        <>
          <p>Still connecting to sign-in. This opens as soon as it answers; check your connection if it doesn't.</p>
          <button
            type="button"
            className="min-h-11 text-flv-ink underline underline-offset-2"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </>
      ) : null}
    </div>
  )
}
