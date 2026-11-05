import { describe, expect, test } from 'vitest'

import { clothNormalTexels } from './fabric-normal'

describe('cloth normal map', () => {
  const { size, texels } = clothNormalTexels()
  const channel = ({ x, y, at }: { x: number; y: number; at: number }) => texels[(y * size + x) * 4 + at]!

  test('is the same every time', () => {
    expect(clothNormalTexels().texels).toEqual(texels)
  })

  test('every texel is a unit normal facing out of the cloth', () => {
    for (let index = 0; index < texels.length; index += 4) {
      const [x, y, z] = [0, 1, 2].map((offset) => (texels[index + offset]! / 255) * 2 - 1) as [number, number, number]

      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1)
      expect(z).toBeGreaterThan(0.5)
    }
  })

  test('tilts evenly, so it adds texture without shading the cloth one way', () => {
    let red = 0
    let green = 0

    for (let index = 0; index < texels.length; index += 4) {
      red += texels[index]!
      green += texels[index + 1]!
    }

    const count = texels.length / 4
    expect(red / count / 255).toBeCloseTo(0.5, 2)
    expect(green / count / 255).toBeCloseTo(0.5, 2)
  })

  test('has no seam where the tile repeats', () => {
    let seam = 0
    let inner = 0

    for (let y = 0; y < size; y += 1) {
      seam = Math.max(seam, Math.abs(channel({ x: 0, y, at: 0 }) - channel({ x: size - 1, y, at: 0 })))
      inner = Math.max(inner, Math.abs(channel({ x: 100, y, at: 0 }) - channel({ x: 101, y, at: 0 })))
    }

    expect(seam).toBeLessThanOrEqual(inner + 2)
  })
})
