import { describe, expect, test } from 'vitest'

import { parseFeedbackAnswer, summarizeFeedback } from './feedback'

describe('feedback answers', () => {
  test('keeps a complete one-tap answer and drops a blank note', () => {
    const parsed = parseFeedbackAnswer({
      value: { wouldWear: true, priceBand: '25_50', size: 'm', tags: ['fit', 'fit', 'colour'], note: '   ' },
    })

    expect(parsed.ok && parsed.answer).toEqual({
      wouldWear: true,
      priceBand: '25_50',
      size: 'm',
      tags: ['fit', 'colour'],
      note: null,
    })
  })

  test('refuses a price or tag that is not on the list', () => {
    expect(parseFeedbackAnswer({ value: { wouldWear: true, priceBand: 'free', tags: [] } }).ok).toBe(false)
    expect(parseFeedbackAnswer({ value: { wouldWear: false, priceBand: 'skip', tags: ['logo'] } }).ok).toBe(false)
  })

  test('counts would-wear, price, size and tags for one version', () => {
    const summary = summarizeFeedback({
      seq: 3,
      answers: [
        { wouldWear: true, priceBand: 'under_25', size: 'm', tags: ['fit', 'colour'], note: null },
        { wouldWear: false, priceBand: 'under_25', size: null, tags: ['fit'], note: 'Sleeves' },
      ],
    })

    expect(summary).toMatchObject({
      seq: 3,
      responses: 2,
      wouldWear: 1,
      priceBands: { under_25: 2, '25_50': 0 },
      sizes: { m: 1, s: 0 },
      tags: { fit: 2, colour: 1, graphic: 0 },
    })
  })
})
