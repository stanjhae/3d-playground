import { describe, expect, test } from 'vitest'

import { stillFrontBox, storedRenderSrc, teeOutlinePoints, teeStillScale, thumbnailKey } from './design-thumbnail'
import type { DesignSummary } from './flp-api/client'
import { copyTitle, readStudioSort, visibleDesigns, writeStudioSort } from './my-studio-list'

const design = (title: string, updatedAt: string): DesignSummary => ({
  id: title,
  title,
  visibility: 'private',
  headSeq: 1,
  updatedAt,
})

const DESIGNS = [
  design('crest tee', '2026-11-03T10:00:00.000Z'),
  design('Café run 10', '2026-11-05T10:00:00.000Z'),
  design('Café run 9', '2026-11-01T10:00:00.000Z'),
  design('Alpha', '2026-11-02T10:00:00.000Z'),
]

describe('My Studio list', () => {
  test('recent puts the last edited first', () => {
    expect(visibleDesigns({ designs: DESIGNS, query: '', sort: 'recent' }).map((each) => each.title)).toEqual([
      'Café run 10',
      'crest tee',
      'Alpha',
      'Café run 9',
    ])
  })

  test('name ignores case and orders numbers as numbers', () => {
    expect(visibleDesigns({ designs: DESIGNS, query: '', sort: 'name' }).map((each) => each.title)).toEqual([
      'Alpha',
      'Café run 9',
      'Café run 10',
      'crest tee',
    ])
  })

  test('search matches every word, in any case and without accents', () => {
    expect(visibleDesigns({ designs: DESIGNS, query: '  CAFE   10 ', sort: 'recent' }).map((each) => each.title)).toEqual([
      'Café run 10',
    ])
    expect(visibleDesigns({ designs: DESIGNS, query: 'zebra', sort: 'recent' })).toEqual([])
  })

  test('a copy is named after its original, inside the limit', () => {
    expect(copyTitle({ title: 'Crest tee' })).toBe('Crest tee copy')
    expect(copyTitle({ title: 'x'.repeat(80) })).toHaveLength(80)
    expect(copyTitle({ title: '   ' })).toBe('Untitled tee copy')
    expect(copyTitle({ title: '', garmentId: 'hoodie' })).toBe('Untitled hoodie copy')
  })

  test('the sort is remembered, and junk or failing storage gives recent', () => {
    const stored = new Map<string, string>()
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) }
    writeStudioSort({ storage, sort: 'name' })
    expect(readStudioSort({ storage })).toBe('name')
    expect(readStudioSort({ storage: { getItem: () => 'oldest' } })).toBe('recent')
    expect(
      readStudioSort({
        storage: {
          getItem: () => {
            throw new Error('blocked')
          },
        },
      }),
    ).toBe('recent')
  })
})

describe('card thumbnails', () => {
  test('use the stored front view only when the published version is the latest', () => {
    const publication = { slug: '0123456789abcdef', status: 'published' as const, seq: 4 }
    expect(storedRenderSrc({ publication, headSeq: 4 })).toBe('/api/flp/public/0123456789abcdef/image?seq=4')
    expect(storedRenderSrc({ publication, headSeq: 5 })).toBeNull()
    expect(storedRenderSrc({ publication: { ...publication, status: 'revoked' }, headSeq: 4 })).toBeNull()
    expect(storedRenderSrc({ publication: null, headSeq: 4 })).toBeNull()
  })

  test('a new save or publish makes a new picture', () => {
    const base = design('Crest', '2026-11-03T10:00:00.000Z')
    expect(thumbnailKey({ design: base })).not.toBe(thumbnailKey({ design: { ...base, headSeq: 2 } }))
    expect(thumbnailKey({ design: base })).not.toBe(thumbnailKey({ design: { ...base, visibility: 'published' } }))
    expect(thumbnailKey({ design: base })).toBe(thumbnailKey({ design: { ...base, title: 'Renamed' } }))
  })
})

describe('stillFrontBox', () => {
  test('the tee front sits across the body from the shoulders', () => {
    expect(stillFrontBox({ tee: true, aspect: 6 / 7, width: 240, height: 260 })).toEqual({
      x: 48,
      y: 260 * 0.04,
      width: 144,
      height: 168,
    })
  })

  test('another garment shows its own front panel, whole and centred at its shape', () => {
    for (const aspect of [0.4, 0.86, 2]) {
      const box = stillFrontBox({ tee: false, aspect, width: 240, height: 260 })
      expect(box.width / box.height).toBeCloseTo(aspect)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x * 2 + box.width).toBeCloseTo(240)
      expect(box.y * 2 + box.height).toBeCloseTo(260)
    }
  })
})


describe('shaped tee stills (shape v1)', () => {
  test('a neutral shape draws the plain outline at full size', () => {
    const { body } = teeOutlinePoints({})
    expect(body[4]).toEqual([0.8, 0.97])
    expect(teeStillScale({})).toBe(1)
  })

  test('a longer sleeve and hem reach further and shrink the still to fit', () => {
    const shape = { leftSleeveLength: 1, rightSleeveLength: 0, bodyLength: 0.4, bodyWidth: 0, necklineDepth: 0 }
    const { body } = teeOutlinePoints({ shape })
    // The wearer's left sleeve is on screen right; its cuff doubles its reach.
    expect(body[1]![0]).toBeCloseTo(1.12, 5)
    expect(body[8]![0]).toBeCloseTo(0.01, 9)
    expect(teeStillScale({ shape })).toBeLessThan(1)
  })
})
