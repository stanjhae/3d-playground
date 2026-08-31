import { beforeEach, describe, expect, test } from 'vitest'

import {
  MAX_AUTHOR_CHARS,
  MAX_OVERRIDE_COUNT,
  MAX_THUMBNAIL_CHARS,
  MAX_TITLE_CHARS,
} from './designs-store'
import {
  capThumbnail,
  createStoredDesign,
  getStoredDesign,
  listStoredDesigns,
  parseDesignDraft,
  resetDesignsStore,
  voteStoredDesign,
} from './designs-store'
import { rankDesigns } from './rank-designs'

const DRAFT = {
  title: 'Guest Silk 01',
  author: 'Guest',
  thumbnailDataUrl: 'data:image/svg+xml;utf8,<svg></svg>',
  overrides: [{ meshName: 'collar', color: '#f4ead4' }],
}

describe('designs store', () => {
  beforeEach(() => {
    resetDesignsStore()
  })

  test('lists the seeded community', () => {
    const designs = listStoredDesigns()

    expect(designs.length).toBeGreaterThanOrEqual(7)
    expect(designs.some((design) => design.id === 'look-midnight-silk')).toBe(
      true,
    )
  })

  test('creates a look with an id and zero votes', () => {
    const before = listStoredDesigns().length
    const created = createStoredDesign({ draft: DRAFT })

    expect(created.id.startsWith('look-')).toBe(true)
    expect(created.votes).toBe(0)
    expect(created.title).toBe('Guest Silk 01')
    expect(listStoredDesigns()).toHaveLength(before + 1)
    expect(getStoredDesign({ id: created.id })?.title).toBe('Guest Silk 01')
  })

  test('caps oversized thumbnails', () => {
    expect(
      capThumbnail({
        thumbnailDataUrl: `data:image/png;base64,${'a'.repeat(MAX_THUMBNAIL_CHARS)}`,
      }),
    ).toBe('')
    expect(capThumbnail({ thumbnailDataUrl: 'data:image/svg+xml,ok' })).toBe(
      'data:image/svg+xml,ok',
    )
  })

  test('createStoredDesign drops an oversized thumbnail', () => {
    const created = createStoredDesign({
      draft: {
        ...DRAFT,
        thumbnailDataUrl: `data:image/png;base64,${'a'.repeat(MAX_THUMBNAIL_CHARS)}`,
      },
    })

    expect(created.thumbnailDataUrl).toBe('')
    expect(getStoredDesign({ id: created.id })?.thumbnailDataUrl).toBe('')
  })

  test('rejects a draft without a title or overrides', () => {
    expect(parseDesignDraft({ body: { title: '', overrides: [] } })).toBeNull()
    expect(parseDesignDraft({ body: { title: 'Look', overrides: [{}] } })).toBeNull()
    expect(
      parseDesignDraft({
        body: {
          title: '  Midnight  ',
          author: '',
          overrides: [{ meshName: 'body' }],
        },
      }),
    ).toEqual({
      title: 'Midnight',
      author: 'Guest',
      thumbnailDataUrl: '',
      overrides: [{ meshName: 'body' }],
    })

    const longTitle = 'M'.repeat(MAX_TITLE_CHARS + 12)
    const longAuthor = 'A'.repeat(MAX_AUTHOR_CHARS + 8)
    const parsed = parseDesignDraft({
      body: {
        title: longTitle,
        author: longAuthor,
        overrides: Array.from({ length: MAX_OVERRIDE_COUNT + 4 }, (_, index) => ({
          meshName: `panel-${index}`,
        })),
      },
    })

    expect(parsed?.title).toHaveLength(MAX_TITLE_CHARS)
    expect(parsed?.author).toHaveLength(MAX_AUTHOR_CHARS)
    expect(parsed?.overrides).toHaveLength(MAX_OVERRIDE_COUNT)
  })

  test('votes increment and missing ids stay gone', () => {
    const before = getStoredDesign({ id: 'look-atelier-ivory' })

    expect(before).not.toBeNull()

    const voted = voteStoredDesign({ id: 'look-atelier-ivory' })

    expect(voted?.votes).toBe((before?.votes ?? 0) + 1)
    expect(voteStoredDesign({ id: 'look-missing' })).toBeNull()
  })

  test('rankDesigns puts the Leader first and one vote can flip it', () => {
    const designs = listStoredDesigns()
    const ranked = rankDesigns({ designs })

    expect(ranked[0]?.id).toBe('look-midnight-silk')
    expect(ranked[1]?.id).toBe('look-atelier-ivory')

    voteStoredDesign({ id: 'look-atelier-ivory' })

    const after = rankDesigns({ designs: listStoredDesigns() })

    expect(after[0]?.id).toBe('look-atelier-ivory')
    expect(after[0]?.votes).toBe(6)
    expect(after[1]?.id).toBe('look-midnight-silk')
  })
})
