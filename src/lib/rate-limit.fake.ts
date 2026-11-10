import { type LimitDecision, type LimitRule, PUBLIC_LIMITS, type PublicBucket, type PublicLimiter, clientAddress } from './rate-limit.ts'

/**
 * An in-memory stand-in for `flp_take_request_token`, for unit tests that
 * have no database. Same fixed-window rule; one window per test.
 */
export function countingLimiter({
  limits = PUBLIC_LIMITS,
}: { limits?: Partial<Record<PublicBucket, Pick<LimitRule, 'limit'>>> } = {}): PublicLimiter {
  const counts = new Map<string, number>()

  return async ({ request, bucket }): Promise<LimitDecision> => {
    const key = `${bucket}:${clientAddress({ request })}`
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    const limit = limits[bucket]?.limit ?? PUBLIC_LIMITS[bucket].limit
    return count > limit ? { allowed: false, reason: 'limited', retryAfter: 60 } : { allowed: true }
  }
}

/** A limiter whose store is down, deciding as `decision` says. */
export const outageLimiter =
  (decision: LimitDecision): PublicLimiter =>
  async () =>
    decision
