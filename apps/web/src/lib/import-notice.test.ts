import { describe, expect, test } from 'vitest'

import { importNoticeLines } from './import-notice'

describe('importNoticeLines', () => {
  test('groups repeated changes with a count, most frequent first', () => {
    expect(
      importNoticeLines({
        notes: [
          { path: '$.layers[0].strokes[0]', message: 'fill strokes are not in v2; left out' },
          { path: '$.layers[0].strokes[2]', message: 'fill strokes are not in v2; left out' },
          { path: '$.layers[1].panel', message: 'legacy panel "left" mapped to the wearer\'s right sleeve' },
        ],
      }),
    ).toEqual([
      'fill strokes are not in v2; left out (×2)',
      'legacy panel "left" mapped to the wearer\'s right sleeve',
    ])
  })

  test('caps the list and says how many kinds are hidden', () => {
    const notes = Array.from({ length: 7 }, (_, i) => ({ path: `$.${i}`, message: `change ${i}` }))
    const lines = importNoticeLines({ notes, max: 5 })

    expect(lines).toHaveLength(6)
    expect(lines.at(-1)).toBe('and 2 more kinds of change')
  })

  test('no notes, no lines', () => {
    expect(importNoticeLines({ notes: [] })).toEqual([])
  })
})
