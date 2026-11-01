import { beforeEach, describe, expect, test } from 'vitest'

import events from '../../api/events'
import { TIMING_BUCKETS, TIMING_EVENTS } from './assumption-events'
import { resetPublicWriteGuards } from './waitlist-handlers'
import { listAssumptionCounts, resetWaitlistStore } from './waitlist-store'

/**
 * The `/api/events` function end to end (Q08 #193): the deployed handler
 * stores only known names and buckets. Needs no Supabase, so it also runs
 * in `pnpm test`.
 */

function post(body: unknown, ip = '203.0.113.7') {
  return events.fetch(
    new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

describe('/api/events', () => {
  beforeEach(() => {
    resetWaitlistStore()
    resetPublicWriteGuards()
  })

  test('accepts every timing in every bucket, counted by bucket', async () => {
    let ip = 0

    for (const name of TIMING_EVENTS) {
      for (const { bucket } of TIMING_BUCKETS) {
        ip += 1
        const response = await post({ name, bucket }, `198.51.100.${ip}`)
        expect(response.status).toBe(201)
      }
    }

    await post({ name: 'save_ack', bucket: 'lt250' })
    const counts = listAssumptionCounts()

    expect(counts['save_ack:lt250']).toBe(2)
    expect(counts['edit_render:gte2500']).toBe(1)
    expect(Object.keys(counts)).toHaveLength(TIMING_EVENTS.length * TIMING_BUCKETS.length)
  })

  test('still accepts the plain journey counts', async () => {
    expect((await post({ name: 'design_saved' })).status).toBe(201)
    expect(listAssumptionCounts()).toEqual({ design_saved: 1 })
  })

  test('refuses unknown names and buckets and stores nothing', async () => {
    const refused = [
      { name: 'vibes' },
      { name: 'save_ack' },
      { name: 'save_ack', bucket: 'lt300' },
      { name: 'render_ms', bucket: 'lt100' },
      { name: 'voted', bucket: 'lt100' },
      { name: 'save_ack', bucket: 'lt100', designId: 'd_123' },
      { name: 'edit_render', bucket: 'lt100', ms: 87 },
      'not json',
    ]

    for (const body of refused) {
      expect((await post(body)).status).toBe(400)
    }

    expect(listAssumptionCounts()).toEqual({})
  })

  test('only POST', async () => {
    const response = await events.fetch(new Request('http://localhost/api/events'))
    expect(response.status).toBe(404)
  })
})
