export const ASSUMPTION_EVENTS = [
  'viewed_demo',
  'voted',
  'started_drawing',
  'published',
  'waitlisted',
  // Owned-studio journey (Q08 #193). Counts only: no IDs, email or content.
  'signed_in',
  'design_created',
  'design_saved',
  'publish_succeeded',
  'publish_failed',
  'recovery_offered',
  'recovery_used',
] as const

export type AssumptionEvent = (typeof ASSUMPTION_EVENTS)[number]

/**
 * Studio timings (Q08 #193), counted per coarse bucket; the exact
 * milliseconds never leave the browser.
 * - `save_ack`: a save request sent until the cloud acknowledged it.
 * - `edit_render`: an editor change until the next drawn 3D frame.
 */
export const TIMING_EVENTS = ['save_ack', 'edit_render'] as const

export type TimingEvent = (typeof TIMING_EVENTS)[number]

/** Upper bounds in ms; the last bucket is everything slower. */
export const TIMING_BUCKETS = [
  { bucket: 'lt100', below: 100 },
  { bucket: 'lt250', below: 250 },
  { bucket: 'lt500', below: 500 },
  { bucket: 'lt1000', below: 1000 },
  { bucket: 'lt2500', below: 2500 },
  { bucket: 'gte2500', below: Number.POSITIVE_INFINITY },
] as const

export type TimingBucket = (typeof TIMING_BUCKETS)[number]['bucket']

const EVENT_SET = new Set<string>(ASSUMPTION_EVENTS)
const TIMING_SET = new Set<string>(TIMING_EVENTS)
const BUCKET_SET = new Set<string>(TIMING_BUCKETS.map(({ bucket }) => bucket))

export function parseAssumptionEvent({
  value,
}: {
  value: unknown
}): AssumptionEvent | null {
  return typeof value === 'string' && EVENT_SET.has(value)
    ? (value as AssumptionEvent)
    : null
}

export function timingBucket({ ms }: { ms: number }): TimingBucket {
  const value = Number.isFinite(ms) ? Math.max(0, ms) : Number.POSITIVE_INFINITY
  return TIMING_BUCKETS.find(({ below }) => value < below)?.bucket ?? 'gte2500'
}

/**
 * The count key an `/api/events` body adds to, or null. A count is its
 * bare name; a timing is `name:bucket`. Anything else (unknown names,
 * unknown buckets, a bucket on a count, extra fields) is refused.
 */
export function parseEventBody({ body }: { body: unknown }): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const { name, bucket, ...rest } = body as { name?: unknown; bucket?: unknown }

  if (Object.keys(rest).length > 0) {
    return null
  }

  if (bucket === undefined) {
    return parseAssumptionEvent({ value: name })
  }

  return typeof name === 'string' &&
    TIMING_SET.has(name) &&
    typeof bucket === 'string' &&
    BUCKET_SET.has(bucket)
    ? `${name}:${bucket}`
    : null
}

async function postEvent(body: { name: string; bucket?: TimingBucket }) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return
  }
}

export async function trackAssumption({
  name,
}: {
  name: AssumptionEvent
}) {
  await postEvent({ name })
}

const sentOnce = new Set<string>()

/** Counts an event at most once per page load and scope (e.g. a design). */
export function trackAssumptionOnce({ name, scope = '' }: { name: AssumptionEvent; scope?: string }) {
  const key = `${name}:${scope}`

  if (sentOnce.has(key)) {
    return
  }

  sentOnce.add(key)
  void trackAssumption({ name })
}

export const TIMING_SAMPLE = { minGapMs: 30_000, maxPerLoad: 20 }

/**
 * Keeps a long session from flooding the counts: per timing, at most one
 * sample every `minGapMs` and `maxPerLoad` per page load. The first
 * timing after each gap is the one kept, which is unrelated to how slow
 * it was, so the buckets stay representative.
 */
export function createTimingSampler({
  minGapMs = TIMING_SAMPLE.minGapMs,
  maxPerLoad = TIMING_SAMPLE.maxPerLoad,
  now = () => Date.now(),
}: {
  minGapMs?: number
  maxPerLoad?: number
  now?: () => number
} = {}) {
  const last = new Map<TimingEvent, number>()
  const sent = new Map<TimingEvent, number>()

  return {
    /** True (and counted) when this timing may be sent now. */
    take(name: TimingEvent) {
      const time = now()
      const previous = last.get(name)
      const count = sent.get(name) ?? 0

      if (count >= maxPerLoad || (previous !== undefined && time - previous < minGapMs)) {
        return false
      }

      last.set(name, time)
      sent.set(name, count + 1)
      return true
    },
  }
}

const sampler = createTimingSampler()

/** Sends one timing as its bucket, if the sampler lets it through. */
export function trackTiming({ name, ms }: { name: TimingEvent; ms: number }) {
  if (!sampler.take(name)) {
    return
  }

  void postEvent({ name, bucket: timingBucket({ ms }) })
}
