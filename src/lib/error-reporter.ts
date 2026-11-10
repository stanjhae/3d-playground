import { describeError, scrubRoute, type ErrorReport } from './error-report.ts'

/**
 * The browser half of error reporting (O1). `src/main.tsx` installs it:
 * React's root error callbacks and the window's `error` and
 * `unhandledrejection` events all end here, and each report goes to this
 * site's `/api/errors` (see `src/lib/error-tunnel.ts`). At most
 * {@link MAX_REPORTS_PER_PAGE} distinct errors per page load.
 */

export const MAX_REPORTS_PER_PAGE = 5

type Send = (report: ErrorReport) => void

/** Noise that says nothing about this site's code. */
export function isIgnorable({ error, message }: { error: unknown; message: string }) {
  const stack = error instanceof Error ? (error.stack ?? '') : ''

  return (
    // Cross-origin script errors arrive with no detail at all.
    message === 'Script error.' ||
    message === 'Script error' ||
    /ResizeObserver loop/.test(message) ||
    /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack) ||
    // A navigation cancelled a fetch; not a fault.
    (error instanceof DOMException && error.name === 'AbortError')
  )
}

export function createErrorReporter({
  send,
  path = () => globalThis.location?.pathname ?? '/',
  max = MAX_REPORTS_PER_PAGE,
}: {
  send: Send
  path?: () => string
  max?: number
}) {
  const seen = new Set<string>()

  return function report({ error, mechanism }: { error: unknown; mechanism: string }) {
    const { type, message, stack } = describeError({ error })

    if (seen.size >= max || isIgnorable({ error, message })) {
      return
    }

    const key = `${type}:${message}:${stack?.split('\n')[1] ?? ''}`

    if (seen.has(key)) {
      return
    }

    seen.add(key)

    try {
      send({ source: 'browser', type, message, stack, mechanism, route: scrubRoute({ path: path() }) })
    } catch {
      // Reporting must never be the thing that breaks the page.
    }
  }
}

/** POSTs a report to `/api/errors`, surviving a page unload. */
export function sendToTunnel(report: ErrorReport) {
  void fetch('/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => {})
}

type ReportFn = ReturnType<typeof createErrorReporter>

/** The window events nothing else catches: errors outside React, and rejected promises no one awaited. */
export function installWindowHandlers({ target, report }: { target: Window; report: ReportFn }) {
  target.addEventListener('error', (event) => {
    report({ error: event.error ?? event.message, mechanism: 'window-error' })
  })
  target.addEventListener('unhandledrejection', (event) => {
    report({ error: event.reason, mechanism: 'unhandled-rejection' })
  })
}
