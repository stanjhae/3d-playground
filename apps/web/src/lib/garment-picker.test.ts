import { describe, expect, test } from 'vitest'

import { GARMENT_IDS } from './design-schema'
import {
  GARMENT_CATEGORIES,
  listGarmentsByCategory,
  listPlannedGarments,
  LOCKED_GARMENT_NOTE,
  PLANNED_GARMENTS,
  pickerCategories,
} from './landing-demo'

describe('garment picker', () => {
  test('Accessories has no garment yet but shows, with its planned pieces', () => {
    expect(listGarmentsByCategory({ category: 'accessories' })).toEqual([])
    expect(listPlannedGarments({ category: 'accessories' }).map((piece) => piece.label)).toEqual(['Cap', 'Tote bag', 'Beanie'])
    expect(pickerCategories().map((entry) => entry.id)).toEqual(GARMENT_CATEGORIES.map((entry) => entry.id))
  })

  test('planned pieces are never garments, so nothing can pick, save or vote on them', () => {
    for (const piece of PLANNED_GARMENTS) {
      expect((GARMENT_IDS as readonly string[]).includes(piece.id), piece.id).toBe(false)
    }
  })

  test('a category with a built garment lists no planned pieces', () => {
    for (const entry of GARMENT_CATEGORIES) {
      if (listGarmentsByCategory({ category: entry.id }).length > 0) {
        expect(listPlannedGarments({ category: entry.id }), entry.id).toEqual([])
      }
    }
  })

  test('the locked note says why and how to switch', () => {
    expect(LOCKED_GARMENT_NOTE).toBe('Saved designs keep their garment. Start a new design to switch.')
  })
})

describe('FLV brand mark', () => {
  const files = import.meta.glob(['/public/brand/*.svg', '/public/graphics/logo-flv.svg', '/public/favicon.svg', '/public/site.webmanifest', '/index.html'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const read = (path: string) => files[`/${path}`] ?? ''

  test('every brand file draws the same letters (scripts/build-brand.mjs)', () => {
    const letters = /d="(M0 0H36[^"]+)"/.exec(read('public/brand/flv-mark.svg'))?.[1]
    expect(letters).toBeDefined()
    for (const path of ['public/brand/flv-mark-mono.svg', 'public/graphics/logo-flv.svg', 'public/favicon.svg']) {
      expect(read(path), path).toContain(`d="${letters}"`)
    }
  })

  test('the mark uses the brand red, the gradient runs red to flare, and it is named', () => {
    expect(read('public/graphics/logo-flv.svg')).toContain('fill="#e0141f"')
    const mark = read('public/brand/flv-mark.svg')
    expect(mark).toMatch(/stop-color="#e0141f"[\s\S]*stop-color="#f0650e"/)
    expect(mark).toContain('<title>FLV</title>')
  })

  test('the page links the icons and the manifest names them', () => {
    const html = read('index.html')
    expect(html).toContain('href="/favicon.svg"')
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"')
    expect(html).toContain('rel="manifest" href="/site.webmanifest"')
    const manifest = JSON.parse(read('public/site.webmanifest')) as { icons: { src: string; sizes: string }[] }
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['any', '180x180', '512x512'])
  })
})
