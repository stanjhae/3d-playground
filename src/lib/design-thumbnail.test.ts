import { describe, expect, test } from 'vitest'

import { keptThumbnail, thumbnailKey } from './design-thumbnail'
import type { DesignSummary } from './flp-api/client'

const design: DesignSummary = { id: 'd1', title: 'Crest', visibility: 'published', headSeq: 3, updatedAt: '2026-11-03T10:00:00.000Z' }

describe('a card thumbnail while its key changes (tester pass 3)', () => {
  const render = { kind: 'render' as const, src: '/api/flp/public/0123456789abcdef/image?seq=3' }

  test('unpublishing keeps the picture until the new one is ready, not the placeholder', () => {
    const before = thumbnailKey({ design })
    const after = thumbnailKey({ design: { ...design, visibility: 'private' } })

    expect(after).not.toBe(before)
    expect(keptThumbnail({ loaded: { key: before, thumbnail: render }, key: after })).toEqual(render)
  })

  test('the new picture replaces it once loaded', () => {
    const still = { kind: 'still' as const, src: 'data:image/png;base64,AAAA' }
    const key = thumbnailKey({ design: { ...design, visibility: 'private' } })

    expect(keptThumbnail({ loaded: { key, thumbnail: still }, key })).toEqual(still)
  })

  test('another design’s picture is never shown, and nothing loaded is the placeholder', () => {
    const other = thumbnailKey({ design: { ...design, id: 'd2' } })

    expect(keptThumbnail({ loaded: { key: other, thumbnail: render }, key: thumbnailKey({ design }) })).toBeNull()
    expect(keptThumbnail({ loaded: null, key: thumbnailKey({ design }) })).toBeNull()
  })
})
