export const ASSUMPTION_EVENTS = [
  'viewed_demo',
  'voted',
  'started_drawing',
  'published',
  'waitlisted',
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
