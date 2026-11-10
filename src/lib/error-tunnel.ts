import {
  ERROR_REPORT_LIMITS,
  describeError,
  parseDsn,
  parseErrorReport,
  scrubRoute,
  sentryEnvelope,
  type ErrorReport,
} from './error-report.ts'
import { allowPublicWrite } from './waitlist-handlers.ts'

/**
 * The server half of error reporting (O1): `POST /api/errors` takes the
 * browser's reports, and {@link withErrorReporting} wraps each API
 * function. Both forward to Sentry only when `SENTRY_DSN` is set.
 */

type Env = Record<string, string | undefined>
type Fetch = typeof fetch

const ERRORS_LIMIT = { max: 10, windowMs: 60 * 1000 }
const FORWARD_TIMEOUT_MS = 2000

function processEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {}
}

/** The build a report belongs to: Vercel's commit, else `local`. */
export function releaseName({ env }: { env: Env }) {
  return env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local'
}

/** `production`, `preview` (staging) or `development`. */
export function environmentName({ env }: { env: Env }) {
  return env.VERCEL_ENV || 'development'
}

/**
 * Sends one report to Sentry. Never throws and gives up after 2 s: a
 * broken tracker must not break the request it is reporting on.
 */
export async function forwardErrorReport({
  report,
  env = processEnv(),
  fetchImpl = fetch,
}: {
  report: ErrorReport
  env?: Env
  fetchImpl?: Fetch
}) {
  const dsn = parseDsn({ dsn: env.SENTRY_DSN })

  if (!dsn) {
    return false
  }

  try {
    const response = await fetchImpl(dsn.envelopeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: sentryEnvelope({
        report,
        dsn,
        release: releaseName({ env }),
        environment: environmentName({ env }),
        eventId: crypto.randomUUID().replaceAll('-', ''),
      }),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    })

    return response.ok
  } catch {
    return false
  }
}

function clientKey({ request }: { request: Request }) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local'
}

/**
 * `POST /api/errors`: one browser report. Answers 202 whether or not it
 * was forwarded, so the page learns nothing about the tracker.
 */
export async function handleErrorsRequest({
  request,
  env = processEnv(),
  fetchImpl = fetch,
}: {
  request: Request
  env?: Env
  fetchImpl?: Fetch
}) {
  const noStore = { 'Cache-Control': 'no-store' }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Not found' }, { status: 404, headers: noStore })
  }

  const origin = request.headers.get('origin')

  if (origin !== null && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'Cross-origin reports are not accepted' }, { status: 403, headers: noStore })
  }

  if (!allowPublicWrite({ key: `errors:${clientKey({ request })}`, ...ERRORS_LIMIT })) {
    return Response.json({ error: 'Too many reports' }, { status: 429, headers: noStore })
  }

  const body = await request.text()

  if (body.length > ERROR_REPORT_LIMITS.bodyBytes) {
    return Response.json({ error: 'Report is too large' }, { status: 413, headers: noStore })
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Report could not be read' }, { status: 400, headers: noStore })
  }

  const report = parseErrorReport({ body: parsed })

  // Only the browser reports through here; API errors are sent directly.
  if (!report || report.source !== 'browser') {
    return Response.json({ error: 'Report could not be read' }, { status: 400, headers: noStore })
  }

  await forwardErrorReport({ report, env, fetchImpl })

  return new Response(null, { status: 202, headers: noStore })
}

type Handler = (request: Request) => Response | Promise<Response>

/**
 * Wraps an API function: a throw becomes a reported 500, and a 5xx the
 * handler returned itself (its own caught failures) is reported too.
 * The report is awaited, because Vercel may freeze the function as soon
 * as the response is returned.
 */
export function withErrorReporting(
  handler: Handler,
  { env, fetchImpl }: { env?: Env; fetchImpl?: Fetch } = {},
): Handler {
  return async (request: Request) => {
    const route = scrubRoute({ path: new URL(request.url).pathname })

    try {
      const response = await handler(request)

      if (response.status >= 500) {
        await forwardErrorReport({
          report: {
            source: 'api',
            type: 'ServerErrorResponse',
            message: `${request.method} ${route} answered ${response.status}`,
            route,
            mechanism: 'api-response',
          },
          env,
          fetchImpl,
        })
      }

      return response
    } catch (error) {
      const described = describeError({ error })
      const report = parseErrorReport({ body: { ...described, source: 'api', route, mechanism: 'api' } })

      if (report) {
        await forwardErrorReport({ report, env, fetchImpl })
      }

      return Response.json(
        { error: { code: 'internal', message: 'Something went wrong' } },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }
}
