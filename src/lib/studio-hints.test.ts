import { describe, expect, test } from 'vitest'

import {
  allHintsHidden,
  hintBoxesOverlap,
  hintPosition,
  nextHint,
  placeHint,
  readDismissedHints,
  writeDismissedHints,
} from './studio-hints'

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

describe('hint placement', () => {
  const viewport = { width: 1280, height: 800 }
  const card = { width: 288, height: 140 }

  test('goes below the control when there is room, pointing at it', () => {
    const anchor = { left: 100, top: 100, width: 40, height: 20 }
    const placed = placeHint({ anchor, card, viewport, keepClear: [] })
    expect(placed).toMatchObject({ side: 'below', left: 100, top: 130 })
    expect(placed!.arrow).toBe(20)
  })

  test('tries above, right and left before giving up', () => {
    const anchor = { left: 100, top: 700, width: 40, height: 20 }
    expect(placeHint({ anchor, card, viewport, keepClear: [] })?.side).toBe('above')

    const tall = { left: 100, top: 20, width: 200, height: 760 }
    expect(placeHint({ anchor: tall, card, viewport, keepClear: [] })?.side).toBe('right')
    expect(placeHint({ anchor: { ...tall, left: 980 }, card, viewport, keepClear: [] })?.side).toBe('left')
  })

  test('never covers the work; with no room it stays in the rail', () => {
    const anchor = { left: 100, top: 20, width: 200, height: 760 }
    const stage = { left: 300, top: 0, width: 980, height: 800 }
    const rail = { left: 0, top: 0, width: 100, height: 800 }
    expect(placeHint({ anchor, card, viewport, keepClear: [stage, rail] })).toBeNull()
  })

  test('stays on screen at phone width', () => {
    const phone = { width: 390, height: 844 }
    const anchor = { left: 300, top: 100, width: 80, height: 30 }
    const placed = hintPosition({ side: 'below', anchor, card: { width: 358, height: 140 }, viewport: phone })
    expect(placed.left).toBe(16)
    expect(placed.left + 358).toBeLessThanOrEqual(phone.width - 16)
    expect(placed.arrow).toBeLessThanOrEqual(358 - 14)
  })

  test('boxes that only touch do not overlap', () => {
    expect(hintBoxesOverlap({ left: 0, top: 0, width: 10, height: 10 }, { left: 10, top: 0, width: 10, height: 10 })).toBe(false)
    expect(hintBoxesOverlap({ left: 0, top: 0, width: 10, height: 10 }, { left: 9, top: 9, width: 10, height: 10 })).toBe(true)
  })
})
