import { type SupabaseClient, createClient } from '@supabase/supabase-js'

/**
 * Request limits shared by every serverless instance (P2). Counts live in
 * Postgres: `public.request_limits` for callers without an account, keyed
 * by a keyed hash of their address, and `public.rate_limits` for accounts
 * (`src/lib/flp-api/server.ts`). Both use fixed windows.
 *
 * Each bucket says what happens when the count can't be taken (the
 * database is slow or down, or the server isn't configured):
 * - `allow` (fail open): the request goes ahead. For reads and for work
 *   people would lose, where an outage of the limiter must not become an
 *   outage of the product.
 * - `refuse` (fail closed): the request is turned away with a 503. For
 *   writes whose only value to an abuser is volume, where a missed request
 *   costs a retry.
 * The reasons are next to each bucket; docs/abuse.md has the whole table.
 *
 * The signed-out limits apply only where {@link requestLimitsApply} says.
 */

export type OutagePolicy = 'allow' | 'refuse'

export type LimitRule = {
  limit: number
  windowSeconds: number
  onOutage: OutagePolicy
}

export const PUBLIC_LIMITS = {
  /**
   * Waitlist sign-ups. Refuse: it stores email addresses, and a flood of
   * them is the abuse; a real person sees "busy, try again".
   */
  waitlist: { limit: 8, windowSeconds: 15 * 60, onOutage: 'refuse' },
  /**
   * Anonymous assumption counts. Refuse: inflating a count is the only
   * thing to gain, and a lost count costs nothing.
   */
  events: { limit: 40, windowSeconds: 60, onOutage: 'refuse' },
  /**
   * Browser error reports. Allow: an outage is when reports matter most,
   * and Sentry limits what it accepts on its side.
   */
  errors: { limit: 10, windowSeconds: 60, onOutage: 'allow' },
  /**
   * The shared-design page (`/s/:slug`). Allow: a shared link must keep
   * working through a limiter outage. Generous, because people behind one
   * address (an office, a phone network) share the count.
   */
  share_page: { limit: 60, windowSeconds: 60, onOutage: 'allow' },
  /**
   * The public JSON and image reads behind a shared page (one page is the
   * design plus up to five views). Allow, for the same reason.
   */
  public_read: { limit: 360, windowSeconds: 60, onOutage: 'allow' },
} as const satisfies Record<string, LimitRule>

export type PublicBucket = keyof typeof PUBLIC_LIMITS

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: 'limited'; retryAfter: number }
  | { allowed: false; reason: 'unavailable' }

export type LimiterEnv = { url: string; secretKey: string }

type Env = Record<string, string | undefined>

function processEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {}
}

/** Supabase's URL and secret key, or null when the server has neither. */
export function limiterEnv(source: Env = processEnv()): LimiterEnv | null {
  return source.SUPABASE_URL && source.SUPABASE_SECRET_KEY
    ? { url: source.SUPABASE_URL, secretKey: source.SUPABASE_SECRET_KEY }
    : null
}

/**
 * Whether these limits apply: on a Vercel deployment (preview or
 * production), or wherever `FLP_REQUEST_LIMITS=on` (the integration tests).
 * Locally every request comes from one address, so the browser tests and
 * a dev server would trip limits meant for many people.
 */
export function requestLimitsApply(source: Env = processEnv()) {
  return Boolean(source.VERCEL_ENV) || source.FLP_REQUEST_LIMITS === 'on'
}

/**
 * The caller's address as Vercel reports it. Vercel sets
 * `x-forwarded-for` itself (a client's own value is replaced), so its
 * first entry is the client.
 */
export function clientAddress({ request }: { request: Request }) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'local'
}

/**
 * HMAC-SHA-256 of the address, keyed with the server's secret, first 32
 * hex characters. The address never reaches the database, and without the
 * secret the hash can't be reversed by trying every IPv4 address.
 */
export async function callerSubject({ address, secret }: { address: string; secret: string }) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`flp-limit:${address}`))

  return [...new Uint8Array(signature)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Applies a bucket's outage policy to a failed count. */
export function outageDecision({ rule }: { rule: Pick<LimitRule, 'onOutage'> }): LimitDecision {
  return rule.onOutage === 'allow' ? { allowed: true } : { allowed: false, reason: 'unavailable' }
}

/** Seconds to wait from `flp_take_token` / `flp_take_request_token`. */
export function decisionFromWait({ wait }: { wait: unknown }): LimitDecision {
  const seconds = Number(wait ?? 0)
  return Number.isFinite(seconds) && seconds > 0
    ? { allowed: false, reason: 'limited', retryAfter: Math.ceil(seconds) }
    : { allowed: true }
}

/** Gives up on one attempt after this long. */
export const LIMIT_TIMEOUT_MS = 1500

/** What a limiter RPC answers, with a throw folded in as an error without a code. */
export type LimiterAnswer = { data: unknown; error: { code?: string; message?: string } | null }

/**
 * Runs a limiter RPC, and runs it once more when it got no answer from
 * Postgres: a timeout or a dropped connection, which come back without an
 * error code (or throw). One slow moment then costs a short wait instead of
 * the outage policy, which refuses publishing and the waitlist. An error
 * Postgres did answer with (it has a code) isn't retried: it won't heal in
 * a moment. A timed-out call that did reach Postgres may take a second
 * token; every limit has room for that.
 */
export async function limiterCall({
  run,
  attempts = 2,
}: {
  /** One attempt, with its own timeout. */
  run: () => PromiseLike<LimiterAnswer>
  attempts?: number
}): Promise<LimiterAnswer> {
  let answer: LimiterAnswer = { data: null, error: { message: 'not run' } }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      answer = await run()
    } catch (error) {
      answer = { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
    }

    if (!answer.error || answer.error.code) {
      return answer
    }
  }

  return answer
}

/**
 * Takes one request from a caller's bucket. Never throws: a failure is
 * logged and decided by the bucket's outage policy.
 */
export async function takePublicToken({
  request,
  bucket,
  env = processEnv(),
  limits = PUBLIC_LIMITS,
  client,
}: {
  request: Request
  bucket: PublicBucket
  env?: Env
  /** Overrides (tests). */
  limits?: Record<PublicBucket, LimitRule>
  /** A ready client (tests); otherwise one is made from `env`. */
  client?: SupabaseClient
}): Promise<LimitDecision> {
  const rule = limits[bucket]
  const config = limiterEnv(env)

  if (!requestLimitsApply(env)) {
    return { allowed: true }
  }

  // Deployed without a database to count in: an outage, not a free pass.
  if (!config) {
    console.error('flp request limit not configured', { bucket })
    return outageDecision({ rule })
  }

  try {
    const admin =
      client ??
      createClient(config.url, config.secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    const subject = await callerSubject({ address: clientAddress({ request }), secret: config.secretKey })
    const { data, error } = await limiterCall({
      run: () =>
        admin
          .rpc('flp_take_request_token', {
            p_subject: subject,
            p_bucket: bucket,
            p_limit: rule.limit,
            p_window_seconds: rule.windowSeconds,
          })
          .abortSignal(AbortSignal.timeout(LIMIT_TIMEOUT_MS)),
    })

    if (error) {
      console.error('flp request limit check failed', { bucket, code: error.code })
      return outageDecision({ rule })
    }

    return decisionFromWait({ wait: data })
  } catch (error) {
    console.error('flp request limit check failed', { bucket, error })
    return outageDecision({ rule })
  }
}

/** Takes one request from a caller's bucket; handlers accept one for tests. */
export type PublicLimiter = (args: { request: Request; bucket: PublicBucket }) => Promise<LimitDecision>

/** The Postgres-backed limiter every deployed handler uses. */
export const sharedLimiter: PublicLimiter = ({ request, bucket }) => takePublicToken({ request, bucket })

/** The 429 or 503 for a refused decision, in the caller's own wording. */
export function refusal({
  decision,
  limitedBody,
  unavailableBody,
}: {
  decision: Exclude<LimitDecision, { allowed: true }>
  limitedBody: unknown
  unavailableBody: unknown
}) {
  return decision.reason === 'limited'
    ? Response.json(limitedBody, {
        status: 429,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': String(decision.retryAfter) },
      })
    : Response.json(unavailableBody, {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
      })
}
