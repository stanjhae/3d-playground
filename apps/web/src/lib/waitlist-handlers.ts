import { parseEventBody } from './assumption-events.ts'
import { HOUSE_COPY } from './house-copy.ts'
import { type PublicLimiter, refusal, sharedLimiter } from './rate-limit.ts'
import { addWaitlistEmail, incrementAssumption } from './waitlist-store.ts'

export async function handleWaitlistRequest({
  request,
  limiter = sharedLimiter,
}: {
  request: Request
  limiter?: PublicLimiter
}) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const decision = await limiter({ request, bucket: 'waitlist' })

  if (!decision.allowed) {
    return refusal({
      decision,
      limitedBody: { error: HOUSE_COPY.waitlistBusy },
      unavailableBody: { error: HOUSE_COPY.waitlistBusy },
    })
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
  limiter = sharedLimiter,
}: {
  request: Request
  limiter?: PublicLimiter
}) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const decision = await limiter({ request, bucket: 'events' })

  if (!decision.allowed) {
    return refusal({
      decision,
      limitedBody: { error: 'The count is busy' },
      unavailableBody: { error: 'The count is busy' },
    })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'The count could not be read' }, { status: 400 })
  }

  // Known names (and, for timings, known buckets) only: nothing else is
  // stored, so no identifier or content can reach the counts (Q08 #193).
  const name = parseEventBody({ body })

  if (!name) {
    return Response.json({ error: 'Unknown assumption' }, { status: 400 })
  }

  await incrementAssumption({ name })

  return Response.json({ ok: true }, { status: 201 })
}
