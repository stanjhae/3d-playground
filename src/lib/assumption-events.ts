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

const EVENT_SET = new Set<string>(ASSUMPTION_EVENTS)

export function parseAssumptionEvent({
  value,
}: {
  value: unknown
}): AssumptionEvent | null {
  return typeof value === 'string' && EVENT_SET.has(value)
    ? (value as AssumptionEvent)
    : null
}

export async function trackAssumption({
  name,
}: {
  name: AssumptionEvent
}) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  } catch {
    return
  }
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
