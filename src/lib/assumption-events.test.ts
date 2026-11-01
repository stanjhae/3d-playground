import { describe, expect, test } from 'vitest'

import {
  TIMING_BUCKETS,
  createTimingSampler,
  parseEventBody,
  timingBucket,
} from './assumption-events'

describe('timing buckets (Q08 #193)', () => {
  test('puts each duration in the first bucket it is below', () => {
    expect(timingBucket({ ms: 0 })).toBe('lt100')
    expect(timingBucket({ ms: 99.9 })).toBe('lt100')
    expect(timingBucket({ ms: 100 })).toBe('lt250')
    expect(timingBucket({ ms: 249 })).toBe('lt250')
    expect(timingBucket({ ms: 250 })).toBe('lt500')
    expect(timingBucket({ ms: 999 })).toBe('lt1000')
    expect(timingBucket({ ms: 1000 })).toBe('lt2500')
    expect(timingBucket({ ms: 2500 })).toBe('gte2500')
    expect(timingBucket({ ms: 60_000 })).toBe('gte2500')
  })

  test('treats odd clocks safely', () => {
    expect(timingBucket({ ms: -5 })).toBe('lt100')
    expect(timingBucket({ ms: Number.NaN })).toBe('gte2500')
    expect(timingBucket({ ms: Number.POSITIVE_INFINITY })).toBe('gte2500')
  })

  test('bucket bounds only grow', () => {
    const bounds = TIMING_BUCKETS.map(({ below }) => below)
    expect([...bounds].sort((a, b) => a - b)).toEqual(bounds)
  })
})

describe('event bodies', () => {
  test('a count is its bare name', () => {
    expect(parseEventBody({ body: { name: 'design_saved' } })).toBe('design_saved')
  })

  test('a timing is its name and bucket', () => {
    expect(parseEventBody({ body: { name: 'save_ack', bucket: 'lt250' } })).toBe('save_ack:lt250')
    expect(parseEventBody({ body: { name: 'edit_render', bucket: 'gte2500' } })).toBe(
      'edit_render:gte2500',
    )
  })

  test('refuses unknown names, buckets and extra fields', () => {
    expect(parseEventBody({ body: { name: 'vibes' } })).toBeNull()
    expect(parseEventBody({ body: { name: 'save_ack' } })).toBeNull()
    expect(parseEventBody({ body: { name: 'save_ack', bucket: 'lt300' } })).toBeNull()
    expect(parseEventBody({ body: { name: 'save_ack', bucket: 250 } })).toBeNull()
    expect(parseEventBody({ body: { name: 'voted', bucket: 'lt100' } })).toBeNull()
    expect(parseEventBody({ body: { name: 'save_ack', bucket: 'lt100', designId: 'd1' } })).toBeNull()
    expect(parseEventBody({ body: { name: 'voted', ms: 120 } })).toBeNull()
    expect(parseEventBody({ body: ['voted'] })).toBeNull()
    expect(parseEventBody({ body: null })).toBeNull()
  })
})

describe('timing sampler', () => {
  test('keeps at most one per timing per gap', () => {
    let time = 0
    const sampler = createTimingSampler({ minGapMs: 30_000, maxPerLoad: 20, now: () => time })

    expect(sampler.take('save_ack')).toBe(true)
    expect(sampler.take('save_ack')).toBe(false)
    // Each timing has its own gap.
    expect(sampler.take('edit_render')).toBe(true)

    time = 29_999
    expect(sampler.take('save_ack')).toBe(false)
    time = 30_000
    expect(sampler.take('save_ack')).toBe(true)
  })

  test('stops after the per-load cap however long the session', () => {
    let time = 0
    const sampler = createTimingSampler({ minGapMs: 1000, maxPerLoad: 3, now: () => time })
    let kept = 0

    for (let step = 0; step < 100; step += 1) {
      time += 1000
      kept += sampler.take('edit_render') ? 1 : 0
    }

    expect(kept).toBe(3)
  })
})
