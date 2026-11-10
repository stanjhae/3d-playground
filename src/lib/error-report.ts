/**
 * Error reports (O1). The browser and the API functions describe a crash
 * as a small {@link ErrorReport}; the server scrubs it and forwards it to
 * Sentry's envelope endpoint when `SENTRY_DSN` is set. Without a DSN
 * reports are dropped. No SDK: the reporter is a few hundred bytes, sends
 * only the fields below, and the browser only ever talks to this site
 * (`/api/errors`), so the Content-Security-Policy needs no new host.
 *
 * Shared by the browser and the server, so nothing here imports Node.
 */

export type ErrorSource = 'browser' | 'api'

export type ErrorReport = {
  source: ErrorSource
  /** The error's class, e.g. `TypeError`. */
  type: string
  message: string
  stack?: string
  /** A path with identifiers replaced, e.g. `/s/:slug`. */
  route?: string
  /** `react-boundary`, `window-error`, `unhandled-rejection`, `api`, ... */
  mechanism: string
}

export const ERROR_REPORT_LIMITS = {
  type: 80,
  message: 500,
  stack: 6000,
  route: 120,
  mechanism: 40,
  /** Largest `/api/errors` body accepted. */
  bodyBytes: 10_000,
}

const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[A-Za-z]{2,}/g
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
const BEARER = /\b(Bearer|apikey)\s+[^\s"',]+/gi
const SUPABASE_KEY = /\bsb_(publishable|secret)_[A-Za-z0-9_-]+/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const QUERY = /(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g

/**
 * Removes anything that could identify a person or a design: email
 * addresses, tokens and keys, IDs, and URL query strings and fragments
 * (sign-in links carry codes there).
 */
export function scrubText({ text }: { text: string }) {
  return text
    .replace(JWT, '[token]')
    .replace(BEARER, '$1 [token]')
    .replace(SUPABASE_KEY, '[key]')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[id]')
    .replace(QUERY, '$1')
}

/** A path with every identifier-like segment replaced, so it names a page, not a design. */
export function scrubRoute({ path }: { path: string }) {
  const clean = path.split(/[?#]/)[0] ?? '/'
  const named: Record<string, string> = { look: ':lookId', s: ':slug', designs: ':id', public: ':slug' }
  const parts = clean.split('/')

  return parts
    .map((part, index) => {
      const previous = parts[index - 1]

      if (previous && named[previous] && part) {
        return named[previous]
      }

      return /\d{3,}|^[0-9a-f-]{16,}$|@/i.test(part) ? ':id' : part
    })
    .join('/')
    .slice(0, ERROR_REPORT_LIMITS.route)
}

function text({ value, max }: { value: unknown; max: number }) {
  return typeof value === 'string' ? scrubText({ text: value }).slice(0, max) : undefined
}

/** Describes a thrown value. Non-errors (a thrown string, a rejected `undefined`) still get a message. */
export function describeError({ error }: { error: unknown }) {
  if (error instanceof Error) {
    return { type: error.name || 'Error', message: error.message, stack: error.stack }
  }

  if (typeof error === 'string') {
    return { type: 'Error', message: error, stack: undefined }
  }

  let message = 'A non-error value was thrown'

  try {
    message = `Non-error thrown: ${JSON.stringify(error)?.slice(0, 200) ?? String(error)}`
  } catch {
    // Circular or otherwise unprintable.
  }

  return { type: 'Error', message, stack: undefined }
}

/**
 * Checks and scrubs a report from the network. Only the known fields
 * survive, each trimmed to its limit; anything else is a null.
 */
export function parseErrorReport({ body }: { body: unknown }): ErrorReport | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const raw = body as Record<string, unknown>
  const type = text({ value: raw.type, max: ERROR_REPORT_LIMITS.type })
  const message = text({ value: raw.message, max: ERROR_REPORT_LIMITS.message })
  const mechanism = text({ value: raw.mechanism, max: ERROR_REPORT_LIMITS.mechanism })

  if (!type || !message || !mechanism || (raw.source !== 'browser' && raw.source !== 'api')) {
    return null
  }

  return {
    source: raw.source,
    type,
    message,
    mechanism,
    stack: text({ value: raw.stack, max: ERROR_REPORT_LIMITS.stack }),
    route: typeof raw.route === 'string' ? scrubRoute({ path: raw.route }) : undefined,
  }
}

export type Dsn = { envelopeUrl: string; publicKey: string; dsn: string }

/** `https://<key>@<host>/<project>` → the envelope endpoint, or null. */
export function parseDsn({ dsn }: { dsn: string | undefined }): Dsn | null {
  if (!dsn) {
    return null
  }

  try {
    const url = new URL(dsn)
    const project = url.pathname.replace(/^\/+|\/+$/g, '')

    if (url.protocol !== 'https:' || !url.username || !/^\d+$/.test(project)) {
      return null
    }

    return {
      dsn,
      publicKey: url.username,
      envelopeUrl: `${url.protocol}//${url.host}/api/${project}/envelope/`,
    }
  } catch {
    return null
  }
}

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number; in_app?: boolean }

/** V8 (`at fn (file:1:2)`) and Firefox/Safari (`fn@file:1:2`) stack lines, oldest call first. */
export function parseStack({ stack }: { stack: string | undefined }): Frame[] {
  if (!stack) {
    return []
  }

  const frames: Frame[] = []

  for (const line of stack.split('\n').slice(0, 50)) {
    const v8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line)
    const gecko = v8 ? null : /^\s*(.*?)@(.+?):(\d+):(\d+)$/.exec(line)
    const match = v8 ?? gecko

    if (match) {
      const filename = match[2]
      frames.push({
        function: match[1] || '?',
        filename,
        lineno: Number(match[3]),
        colno: Number(match[4]),
        in_app: !/node_modules|^node:|^native/.test(filename),
      })
    }
  }

  return frames.reverse()
}

/**
 * The Sentry envelope for one report. No user, IP, request headers,
 * cookies or breadcrumbs: only what {@link ErrorReport} holds.
 */
export function sentryEnvelope({
  report,
  dsn,
  release,
  environment,
  eventId,
  now = new Date(),
}: {
  report: ErrorReport
  dsn: Dsn
  release?: string
  environment?: string
  eventId: string
  now?: Date
}) {
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: 'javascript',
    level: 'error',
    release,
    environment,
    // Sentry would otherwise fill these in from the connection.
    user: { ip_address: null },
    tags: { source: report.source, route: report.route ?? 'unknown', mechanism: report.mechanism },
    transaction: report.route,
    exception: {
      values: [
        {
          type: report.type,
          value: report.message,
          mechanism: { type: report.mechanism, handled: report.mechanism === 'react-boundary' },
          stacktrace: { frames: parseStack({ stack: report.stack }) },
        },
      ],
    },
  }
  const header = { event_id: eventId, sent_at: now.toISOString(), dsn: dsn.dsn }

  return [JSON.stringify(header), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n')
}
