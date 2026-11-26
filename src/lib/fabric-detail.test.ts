import { describe, expect, test } from 'vitest'

import { DETAIL_IDS, detailNormalMap, detailNormalTexels } from './fabric-detail'

describe.each(DETAIL_IDS)('%s normal map', (id) => {
  const { size, texels } = detailNormalTexels({ id })
  const channel = ({ x, y, at }: { x: number; y: number; at: number }) => texels[(y * size + x) * 4 + at]!

  test('is the same every time', () => {
    const again = detailNormalTexels({ id }).texels
    expect(again.every((value, index) => value === texels[index])).toBe(true)
  })

  test('every texel is a unit normal facing out of the cloth', () => {
    let worstLength = 0
    let lowestZ = 1

    for (let index = 0; index < texels.length; index += 4) {
      const x = (texels[index]! / 255) * 2 - 1
      const y = (texels[index + 1]! / 255) * 2 - 1
      const z = (texels[index + 2]! / 255) * 2 - 1
      worstLength = Math.max(worstLength, Math.abs(Math.hypot(x, y, z) - 1))
      lowestZ = Math.min(lowestZ, z)
    }

    expect(worstLength).toBeLessThan(0.05)
    expect(lowestZ).toBeGreaterThan(0.5)
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
    for (const at of [0, 1]) {
      let seam = 0
      let inner = 0

      for (let line = 0; line < size; line += 1) {
        const [ex, ey, nx, ny] = at === 0 ? [size - 1, line, 0, line] : [line, size - 1, line, 0]
        seam = Math.max(seam, Math.abs(channel({ x: ex, y: ey, at }) - channel({ x: nx, y: ny, at })))

        for (let step = 1; step < size; step += 1) {
          const [ax, ay, bx, by] = at === 0 ? [step - 1, line, step, line] : [line, step - 1, line, step]
          inner = Math.max(inner, Math.abs(channel({ x: ax, y: ay, at }) - channel({ x: bx, y: by, at })))
        }
      }

      expect(seam).toBeLessThanOrEqual(inner + 2)
    }
  })

  test('is cached, one texture per detail', () => {
    expect(detailNormalMap({ id })).toBe(detailNormalMap({ id }))
  })
})

async function sha256({ texels }: { texels: Uint8Array }) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(texels))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

test('the knit stays the same texel for texel (coarser since 22 Nov, so it shows)', async () => {
  const { texels } = detailNormalTexels({ id: 'knit' })

  expect(await sha256({ texels })).toBe(
    '896a362c93ac78c6735c29d5450d3d1a8bdadab684013c978a3196627938c352',
  )
  expect(detailNormalMap({ id: 'knit' }).repeat.x).toBe(3)
})

test('the details differ from one another', async () => {
  const hashes = await Promise.all(DETAIL_IDS.map((id) => sha256({ texels: detailNormalTexels({ id }).texels })))
  expect(new Set(hashes).size).toBe(DETAIL_IDS.length)
})
