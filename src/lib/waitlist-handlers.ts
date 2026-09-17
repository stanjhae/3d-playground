import { parseAssumptionEvent } from './assumption-events.ts'
import { HOUSE_COPY } from './house-copy.ts'
import { addWaitlistEmail, incrementAssumption } from './waitlist-store.ts'

const WAITLIST_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 }
const EVENTS_LIMIT = { max: 40, windowMs: 60 * 1000 }

const writeHits = new Map<string, number[]>()

export function resetPublicWriteGuards() {
  writeHits.clear()
}

function clientKey({ request }: { request: Request }) {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()

  return first || request.headers.get('x-real-ip') || 'local'
}

export function allowPublicWrite({
  key,
  max,
  windowMs,
}: {
  key: string
  max: number
  windowMs: number
}) {
  const now = Date.now()
  const recent = (writeHits.get(key) ?? []).filter((time) => now - time < windowMs)

  if (recent.length >= max) {
    writeHits.set(key, recent)
    return false
  }

  recent.push(now)
  writeHits.set(key, recent)
  return true
}

export async function handleWaitlistRequest({
  request,
}: {
  request: Request
}) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (
    !allowPublicWrite({
      key: `waitlist:${clientKey({ request })}`,
      max: WAITLIST_LIMIT.max,
      windowMs: WAITLIST_LIMIT.windowMs,
    })
  ) {
    return Response.json({ error: HOUSE_COPY.waitlistBusy }, { status: 429 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: HOUSE_COPY.waitlistFailed }, { status: 400 })
  }

  const email =
    body && typeof body === 'object' && 'email' in body
      ? (body as { email?: unknown }).email
      : null
  const result = await addWaitlistEmail({
    email: typeof email === 'string' ? email : '',
  })

  if (!result.ok) {
    return Response.json({ error: HOUSE_COPY.waitlistFailed }, { status: 400 })
  }

  await incrementAssumption({ name: 'waitlisted' })

  return Response.json({ ok: true }, { status: 201 })
}

export async function handleEventsRequest({
  request,
}: {
  request: Request
}) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (
    !allowPublicWrite({
      key: `events:${clientKey({ request })}`,
      max: EVENTS_LIMIT.max,
      windowMs: EVENTS_LIMIT.windowMs,
    })
  ) {
    return Response.json({ error: 'The count is busy' }, { status: 429 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'The count could not be read' }, { status: 400 })
  }

  const name = parseAssumptionEvent({
    value:
      body && typeof body === 'object' && 'name' in body
        ? (body as { name?: unknown }).name
        : null,
  })

  if (!name) {
    return Response.json({ error: 'Unknown assumption' }, { status: 400 })
  }

  await incrementAssumption({ name })

  return Response.json({ ok: true }, { status: 201 })
}
