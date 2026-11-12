import { describe, expect, it } from 'vitest'

import { pinchedPlacement, twoFingerChange } from './two-finger'

describe('twoFingerChange', () => {
  it('reads spread, turn and travel', () => {
    const change = twoFingerChange({
      start: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      now: [{ x: 10, y: 10 }, { x: 10, y: 210 }],
    })

    expect(change.scale).toBeCloseTo(2)
    expect(change.turn).toBeCloseTo(Math.PI / 2)
    expect(change.pan).toEqual({ x: -40, y: 110 })
  })

  it('takes the short way round past ±π', () => {
    const change = twoFingerChange({
      start: [{ x: 0, y: 0 }, { x: -100, y: 1 }],
      now: [{ x: 0, y: 0 }, { x: -100, y: -1 }],
    })

    expect(Math.abs(change.turn)).toBeLessThan(0.1)
  })
})

describe('pinchedPlacement', () => {
  it('scales within the slider range and turns the mark with the fingers', () => {
    expect(pinchedPlacement({ scale: 0.3, rotation: 0, change: { scale: 2, turn: 0.5 } })).toEqual({ scale: 0.6, rotation: -0.5 })
    expect(pinchedPlacement({ scale: 0.5, rotation: 0, change: { scale: 4, turn: 0 } }).scale).toBe(0.8)
    expect(pinchedPlacement({ scale: 0.1, rotation: 0, change: { scale: 0.1, turn: 0 } }).scale).toBe(0.05)
  })
})
