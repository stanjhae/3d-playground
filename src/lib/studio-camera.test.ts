import { describe, expect, test } from 'vitest'

import { modelSeat } from './studio-camera'

function expectNear({ actual, expected }: { actual: readonly number[]; expected: readonly number[] }) {
  expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 6))
}

const HOODIE = {
  min: [-0.37, 0.87, -0.23] as const,
  max: [0.37, 1.65, 0.21] as const,
  sleeves: { left: [-0.25, 1.2, -0.02] as const, right: [0.25, 1.2, -0.02] as const },
}

describe('modelSeat (real models)', () => {
  test('front and back look at the garment from either side, far enough to fit it', () => {
    const front = modelSeat({ preset: 'front', frame: HOODIE })
    const back = modelSeat({ preset: 'back', frame: HOODIE })

    expectNear({ actual: front.target, expected: [0, 1.26, -0.01] })
    expect(front.seat[2]).toBeGreaterThan(1.5)
    expect(back.seat[2]).toBeLessThan(-1.5)
  })

  test('each sleeve view aims at the sleeve on its own side', () => {
    expect(modelSeat({ preset: 'left', frame: HOODIE }).target).toEqual([-0.25, 1.2, -0.02])
    expect(modelSeat({ preset: 'right', frame: HOODIE }).target).toEqual([0.25, 1.2, -0.02])
    expect(modelSeat({ preset: 'left', frame: HOODIE }).seat[0]).toBeLessThan(-0.25)
  })

  test('a sleeveless garment turns the sleeve views to its side', () => {
    const frame = { ...HOODIE, sleeves: {} }
    expectNear({ actual: modelSeat({ preset: 'right', frame }).target, expected: [0, 1.26, -0.01] })
  })
})
