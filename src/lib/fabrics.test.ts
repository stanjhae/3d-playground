import { describe, expect, test } from 'vitest'

import { DETAIL_IDS } from './fabric-detail'
import { FABRIC_MAP_SRC } from './fabric-maps'
import { getFabricById, getFabricByMapId, getFabricForOverride, listFabrics } from './fabrics'

describe('listFabrics', () => {
  test('includes the five families and at least eight editorial colors', () => {
    const fabrics = listFabrics()
    const names = fabrics.map((fabric) => fabric.name)

    expect(names).toEqual(
      expect.arrayContaining(['Cotton', 'Silk', 'Wool', 'Denim', 'Leather']),
    )
    expect(fabrics.length).toBeGreaterThanOrEqual(13)

    for (const fabric of fabrics) {
      expect(fabric).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          color: expect.stringMatching(/^#/),
          roughness: expect.any(Number),
          metalness: expect.any(Number),
        }),
      )
      expect(fabric).not.toHaveProperty('slider')
      expect(fabric).not.toHaveProperty('roughnessRange')
    }
  })

  test('honors limit', () => {
    expect(listFabrics({ limit: 0 })).toEqual([])
    expect(listFabrics({ limit: 2 })).toHaveLength(2)
  })
})

describe('getFabricById', () => {
  test('returns a named preset', () => {
    const silk = getFabricById({ id: 'ivory-silk' })

    expect(silk?.name).toBe('Ivory Silk')
    expect(silk?.mapId).toBe('silk-shine')
  })

  test('returns undefined for unknown ids', () => {
    expect(getFabricById({ id: 'missing' })).toBeUndefined()
  })
})

describe('getFabricForOverride', () => {
  test('uses the first family preset when only a map is known', () => {
    expect(getFabricByMapId({ mapId: 'silk-shine' })?.id).toBe('silk')
    expect(getFabricForOverride({ mapId: 'silk-shine' })?.id).toBe('silk')
  })

  test('matches the editorial color on the same map family', () => {
    expect(
      getFabricForOverride({ mapId: 'silk-shine', color: '#e8c4b8' })?.id,
    ).toBe('blush-silk')
  })
})

describe('fabric maps', () => {
  const sources: Record<string, string> = FABRIC_MAP_SRC

  test('every mapId has a source file, at most 64 KiB', async () => {
    const { existsSync, statSync } = (await import(
      // @ts-expect-error Node built-in; tests run in Vitest, not the browser bundle
      'node:fs'
    )) as { existsSync: (path: URL) => boolean; statSync: (path: URL) => { size: number } }

    for (const fabric of listFabrics()) {
      if (!fabric.mapId) {
        continue
      }

      const src = sources[fabric.mapId]
      expect(src, `${fabric.id} uses ${fabric.mapId}`).toBeDefined()

      const file = new URL(`../../public${src}`, import.meta.url)
      expect(existsSync(file), `${src} exists`).toBe(true)
      expect(statSync(file).size).toBeLessThanOrEqual(64 * 1024)
    }
  })

  test('every listed map is used by a fabric', () => {
    const used = new Set(listFabrics().map((fabric) => fabric.mapId))

    for (const mapId of Object.keys(sources)) {
      expect(used.has(mapId), mapId).toBe(true)
    }
  })
})

describe('the new cloths', () => {
  test.each(['linen', 'satin', 'jersey', 'chiffon', 'canvas'])('%s comes in two or three colourways', (family) => {
    const base = getFabricById({ id: family })
    const colourways = listFabrics().filter((fabric) => fabric.mapId === base?.mapId)

    expect(base).toBeDefined()
    expect(colourways.length).toBeGreaterThanOrEqual(2)
    expect(colourways.length).toBeLessThanOrEqual(3)
    expect(new Set(colourways.map((fabric) => fabric.color)).size).toBe(colourways.length)
  })

  test('chiffon is sheer and canvas is rough', () => {
    expect(getFabricById({ id: 'chiffon' })?.opacity).toBeLessThan(1)
    expect(getFabricById({ id: 'canvas' })?.roughness).toBeGreaterThanOrEqual(0.95)
  })

  test('every relief a fabric names exists, and a family shares one', () => {
    for (const fabric of listFabrics()) {
      if (fabric.detailId) {
        expect(DETAIL_IDS).toContain(fabric.detailId)
      }

      const head = fabric.mapId ? getFabricByMapId({ mapId: fabric.mapId }) : undefined
      expect(fabric.detailId, fabric.id).toBe(head?.detailId)
    }
  })
})
