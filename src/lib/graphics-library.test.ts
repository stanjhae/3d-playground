import { describe, expect, test } from 'vitest'

import licences from '../../public/graphics/LICENSES.md?raw'
import { GRAPHIC_IDS } from './graphics-ids.gen'
import { GRAPHIC_ASSETS, GRAPHIC_CATEGORIES, listGraphicsByCategory, searchGraphics } from './graphics-library'

const files = import.meta.glob('/public/graphics/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ids = (assets: { id: string }[]) => assets.map((asset) => asset.id)

// Saved designs refer to these by src, so they must keep resolving.
const ORIGINAL_IDS = [
  'cross-gothic',
  'cross-ornate',
  'cross-simple',
  'cross-flare',
  'flame-rise',
  'flame-side',
  'flame-burst',
  'logo-flv',
  'logo-crown',
  'shape-stripe',
]

describe('graphics library', () => {
  test('lists assets by category', () => {
    expect(listGraphicsByCategory({ category: 'crosses' }).length).toBeGreaterThan(0)
    expect(listGraphicsByCategory({ category: 'flames' }).length).toBeGreaterThan(0)
    expect(listGraphicsByCategory({ category: 'all' })).toHaveLength(GRAPHIC_ASSETS.length)
  })

  test('every asset lives under /graphics/', () => {
    for (const asset of GRAPHIC_ASSETS) {
      expect(asset.src).toBe(`/graphics/${asset.id}.svg`)
    }
  })

  test('is a curated catalogue of 60 to 100 graphics, every category filled', () => {
    expect(GRAPHIC_ASSETS.length).toBeGreaterThanOrEqual(60)
    expect(GRAPHIC_ASSETS.length).toBeLessThanOrEqual(100)
    expect(new Set(ids([...GRAPHIC_ASSETS])).size).toBe(GRAPHIC_ASSETS.length)

    for (const category of GRAPHIC_CATEGORIES) {
      expect(listGraphicsByCategory({ category: category.id }).length, category.id).toBeGreaterThan(0)
    }
  })

  test('the bare id list matches the catalogue', () => {
    expect(GRAPHIC_IDS).toEqual(ids([...GRAPHIC_ASSETS]))
  })

  test('keeps every original id, with the same src and label', () => {
    const byId = new Map(GRAPHIC_ASSETS.map((asset) => [asset.id, asset]))
    for (const id of ORIGINAL_IDS) {
      expect(byId.get(id)?.src, id).toBe(`/graphics/${id}.svg`)
    }
    expect(byId.get('cross-simple')?.label).toBe('Simple Cross')
    expect(byId.get('cross-gothic')?.label).toBe('Gothic Cross')
  })

  test('the FLV mark is listed as the brand, not as CC0', () => {
    const flv = GRAPHIC_ASSETS.find((asset) => asset.id === 'logo-flv')
    expect(flv).toMatchObject({ label: 'FLV Mark', category: 'logos', licence: 'All rights reserved' })
  })

  test('every asset has tags, an author and a licence, and a recorded source', () => {
    for (const asset of GRAPHIC_ASSETS) {
      expect(asset.tags.length, asset.id).toBeGreaterThan(0)
      expect(asset.author, asset.id).not.toBe('')
      expect(asset.licence, asset.id).not.toBe('')
      expect(licences, asset.id).toContain(`\`${asset.id}.svg\``)
    }
  })

  test('every file in public/graphics is in the catalogue', () => {
    const listed = new Set(GRAPHIC_ASSETS.map((asset) => `/public/graphics/${asset.id}.svg`))
    expect(Object.keys(files).filter((file) => !listed.has(file))).toEqual([])
  })

  test('every drawn graphic is an SVG with a viewBox and an intrinsic size', () => {
    for (const asset of GRAPHIC_ASSETS.filter((entry) => entry.id !== 'logo-flv')) {
      const text = files[`/public/graphics/${asset.id}.svg`]
      expect(text, asset.id).toBeDefined()
      expect(text, asset.id).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/)
      expect(text, asset.id).not.toMatch(/<script|href="http|NaN/)
    }
  })
})

describe('searchGraphics', () => {
  test('an empty query lists the category', () => {
    expect(searchGraphics({ query: '   ', category: 'florals' })).toEqual(listGraphicsByCategory({ category: 'florals' }))
  })

  test('matches names and tags, case-insensitively, from the start of a word', () => {
    expect(ids(searchGraphics({ query: 'ROSE' }))[0]).toBe('rose')
    expect(ids(searchGraphics({ query: 'rose' }))).toContain('compass')
    expect(ids(searchGraphics({ query: 'tattoo' }))).toContain('star-nautical')
    expect(ids(searchGraphics({ query: 'flam' }))).toContain('flame-hotrod')
    expect(ids(searchGraphics({ query: 'ose' }))).not.toContain('rose')
  })

  test('every word must match', () => {
    const results = searchGraphics({ query: 'cross gold' })
    expect(results.length).toBeGreaterThan(0)
    for (const asset of results) {
      expect(asset.category).toBe('crosses')
    }
    expect(ids(results)).toContain('cross-ornate')
    expect(ids(results)).not.toContain('cross-simple')
  })

  test('the category word itself finds the category', () => {
    expect(ids(searchGraphics({ query: 'type ornaments' }))).toEqual(ids(listGraphicsByCategory({ category: 'ornaments' })))
  })

  test('ignores punctuation and accents', () => {
    expect(ids(searchGraphics({ query: 'Fleur-de-lis' }))).toContain('fleur-de-lis')
    expect(ids(searchGraphics({ query: 'flèur' }))).toContain('fleur-de-lis')
  })

  test('narrows to the chosen category', () => {
    const hearts = searchGraphics({ query: 'heart', category: 'flames' })
    expect(ids(hearts)).toEqual(['flame-heart'])
  })

  test('name matches come before tag-only matches', () => {
    const results = ids(searchGraphics({ query: 'gold' }))
    const named = results.filter((id) => GRAPHIC_ASSETS.find((asset) => asset.id === id)!.label.toLowerCase().includes('gold'))
    expect(named.length).toBeGreaterThan(0)
    expect(results.slice(0, named.length)).toEqual(named)
    expect(results.length).toBeGreaterThan(named.length)
  })

  test('finds nothing for a word no graphic carries', () => {
    expect(searchGraphics({ query: 'spaceship' })).toEqual([])
  })
})
