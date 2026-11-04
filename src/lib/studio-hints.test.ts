import { describe, expect, test } from 'vitest'

import { allHintsHidden, nextHint, readDismissedHints, writeDismissedHints } from './studio-hints'

describe('studio hints', () => {
  test('come one at a time, and only on their step', () => {
    expect(nextHint({ step: 'design', dismissed: [] })?.id).toBe('panels')
    expect(nextHint({ step: 'design', dismissed: ['panels'] })?.id).toBe('drawing')
    expect(nextHint({ step: 'share', dismissed: [] })?.id).toBe('publishing')
    expect(nextHint({ step: 'select', dismissed: [] })).toBeNull()
  })

  test('stop when all are dismissed or hidden', () => {
    expect(nextHint({ step: 'design', dismissed: ['panels', 'drawing', 'precise', 'saving'] })).toBeNull()
    expect(nextHint({ step: 'design', dismissed: allHintsHidden() })).toBeNull()
  })

  test('storage that fails or holds junk changes nothing', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readDismissedHints({ storage: throwing })).toEqual([])
    expect(() => writeDismissedHints({ storage: throwing, dismissed: ['panels'] })).not.toThrow()
    expect(readDismissedHints({ storage: { getItem: () => '{not json' } })).toEqual([])
    expect(readDismissedHints({ storage: { getItem: () => '{"a":1}' } })).toEqual([])
    expect(readDismissedHints({ storage: null })).toEqual([])
  })
})
