import { describe, expect, test } from 'vitest'

import { frontOutlineOf } from './design-thumbnail'
import { FRONT_OUTLINES } from './front-outlines.gen'
import { TEMPLATE_IDS, resolveTemplate } from './template-manifest'

/**
 * The My Studio card draws a garment's front in its own outline (tester pass
 * 3: a new hoodie's card was a blank white rectangle). The outlines are
 * traced from each model by `scripts/build-front-outlines.mjs`; a re-baked
 * model needs them traced again.
 */

const glbTemplates = TEMPLATE_IDS.flatMap((id) =>
  Array.from({ length: 20 }, (_, index) => resolveTemplate({ id, version: index + 1 }))
    .flatMap((resolved) => (resolved.ok && resolved.manifest.geometry.kind === 'glb' && resolved.manifest.garmentId !== 'tee' ? [resolved.manifest] : [])),
)

describe('front outlines', () => {
  test.each(glbTemplates.map((manifest) => [`${manifest.id}@${manifest.version}`, manifest] as const))(
    '%s has one, traced from the model it pins',
    (_key, manifest) => {
      const polygons = frontOutlineOf({ template: { id: manifest.id, version: manifest.version } })

      expect(FRONT_OUTLINES[`${manifest.id}@${manifest.version}`]?.sha256).toBe(manifest.geometry.sha256.slice(0, 16))
      expect(polygons?.length).toBeGreaterThan(0)

      for (const polygon of polygons!) {
        expect(polygon.length).toBeGreaterThanOrEqual(6)
        expect(Math.min(...polygon)).toBeGreaterThanOrEqual(0)
        expect(Math.max(...polygon)).toBeLessThanOrEqual(1)
      }
    },
  )

  test('the tee has none: its card draws the tee outline', () => {
    for (const version of [3, 7]) {
      expect(frontOutlineOf({ template: { id: 'tee-crew-short', version } })).toBeNull()
    }
  })

  test('nothing is kept for a model the app no longer has', () => {
    const keys = new Set(glbTemplates.map((manifest) => `${manifest.id}@${manifest.version}`))
    expect(Object.keys(FRONT_OUTLINES).filter((key) => !keys.has(key))).toEqual([])
  })
})
