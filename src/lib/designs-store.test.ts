import { beforeEach, describe, expect, test } from 'vitest'

import {
  DesignsBoardFullError,
  MAX_AUTHOR_CHARS,
  MAX_LIVE_DESIGNS,
  MAX_OVERRIDE_COUNT,
  MAX_THUMBNAIL_CHARS,
  MAX_TITLE_CHARS,
} from './designs-store'
import {
  capBoard,
  capThumbnail,
  createStoredDesign,
  getStoredDesign,
  hydrateDesignsStore,
  listStoredDesigns,
  mergeDesigns,
  normalizeLoadedDesign,
  parseDesignDraft,
  persistDesignsStore,
  resetDesignsStore,
  voteStoredDesign,
} from './designs-store'
import type { DesignsPersist } from './designs-persist'
import { createEmptyDesign } from './design-schema'
import { rankDesigns } from './rank-designs'

const DRAFT = {
  title: 'Guest Silk 01',
  author: 'Guest',
  thumbnailDataUrl: 'data:image/png;base64,abc',
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
    expect(
      designs.find((design) => design.id === 'look-midnight-silk')?.garmentId,
    ).toBe('gown')
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
    expect(capThumbnail({ thumbnailDataUrl: 'data:image/png;base64,ok' })).toBe(
      'data:image/png;base64,ok',
    )
    expect(capThumbnail({ thumbnailDataUrl: 'data:image/svg+xml,ok' })).toBe('')
    expect(
      capThumbnail({ thumbnailDataUrl: '/stills/look-midnight-silk.png' }),
    ).toBe('/stills/look-midnight-silk.png')
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

  test('parseDesignDraft keeps house forms and aliases live column looks', () => {
    expect(
      parseDesignDraft({
        body: {
          title: 'Midnight',
          author: 'Guest',
          overrides: [{ meshName: 'body' }],
          garmentId: 'column',
        },
      })?.garmentId,
    ).toBe('gown')
    expect(
      parseDesignDraft({
        body: {
          title: 'Mixed',
          author: 'Guest',
          overrides: [{ meshName: 'skirt' }],
          garmentId: 'mixed',
        },
      })?.garmentId,
    ).toBe('mixed')
    expect(
      parseDesignDraft({
        body: {
          title: 'Jacket',
          author: 'Guest',
          overrides: [{ meshName: 'collar' }],
          garmentId: 'jacket',
        },
      })?.garmentId,
    ).toBe('jacket')
    expect(
      parseDesignDraft({
        body: {
          title: 'Unknown',
          author: 'Guest',
          overrides: [{ meshName: 'body' }],
          garmentId: 'lathe',
        },
      })?.garmentId,
    ).toBe('gown')

    const created = createStoredDesign({
      draft: {
        ...DRAFT,
        garmentId: 'suit',
      },
    })

    expect(created.garmentId).toBe('suit')
    expect(getStoredDesign({ id: created.id })?.garmentId).toBe('suit')
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
      garmentId: 'gown',
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

  test('parseDesignDraft caps an oversized thumbnail', () => {
    const parsed = parseDesignDraft({
      body: {
        title: 'Huge Still',
        author: 'Guest',
        thumbnailDataUrl: `data:image/png;base64,${'a'.repeat(MAX_THUMBNAIL_CHARS)}`,
        overrides: [{ meshName: 'body' }],
      },
    })

    expect(parsed?.thumbnailDataUrl).toBe('')
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

  test('refuses a twenty-fifth look', () => {
    const room = MAX_LIVE_DESIGNS - listStoredDesigns().length

    for (let index = 0; index < room; index += 1) {
      createStoredDesign({
        draft: { ...DRAFT, title: `House Look ${index}` },
      })
    }

    expect(() => {
      createStoredDesign({ draft: DRAFT })
    }).toThrow(DesignsBoardFullError)
  })

  test('normalizeLoadedDesign drops corrupt and unsafe records', () => {
    expect(normalizeLoadedDesign({ value: { title: 'No id' } })).toBeNull()
    expect(
      normalizeLoadedDesign({
        value: {
          id: 'look-bad',
          title: 'No panels',
          author: 'Guest',
          votes: 3,
        },
      }),
    ).toBeNull()

    const loaded = normalizeLoadedDesign({
      value: {
        id: 'look-safe',
        title: 'Safe',
        author: 'Guest',
        votes: 2.8,
        thumbnailDataUrl: 'javascript:alert(1)',
        overrides: [{ meshName: 'body', color: '#111111' }],
      },
    })

    expect(loaded).toMatchObject({
      id: 'look-safe',
      title: 'Safe',
      votes: 2,
      thumbnailDataUrl: '',
    })
  })

  test('mergeDesigns unions looks and keeps the higher vote', () => {
    const remote = [
      {
        ...createEmptyDesign({ id: 'look-midnight-silk' }),
        title: 'Midnight Silk Column',
        votes: 6,
        thumbnailDataUrl: '/stills/look-midnight-silk.png',
        overrides: [{ meshName: 'body' }],
      },
      {
        ...createEmptyDesign({ id: 'look-guest-a' }),
        title: 'Guest A',
        votes: 1,
        thumbnailDataUrl: 'data:image/png;base64,a',
        overrides: [{ meshName: 'body' }],
      },
    ]
    const local = [
      {
        ...createEmptyDesign({ id: 'look-midnight-silk' }),
        title: 'Midnight Silk Column',
        votes: 7,
        thumbnailDataUrl: '/stills/look-midnight-silk.png',
        overrides: [{ meshName: 'body' }],
      },
      {
        ...createEmptyDesign({ id: 'look-guest-b' }),
        title: 'Guest B',
        votes: 0,
        thumbnailDataUrl: 'data:image/png;base64,b',
        overrides: [{ meshName: 'body' }],
      },
    ]
    const merged = mergeDesigns({ local, remote })

    expect(merged).toHaveLength(3)
    expect(
      merged.find((design) => design.id === 'look-midnight-silk')?.votes,
    ).toBe(7)
    expect(merged.some((design) => design.id === 'look-guest-a')).toBe(true)
    expect(merged.some((design) => design.id === 'look-guest-b')).toBe(true)
  })

  test('capBoard keeps house looks and the highest guests', () => {
    const seeds = listStoredDesigns()
    const guests = Array.from({ length: 20 }, (_, index) => ({
      ...createEmptyDesign({ id: `look-guest-${index}` }),
      title: `Guest ${index}`,
      votes: index,
      thumbnailDataUrl: 'data:image/png;base64,a',
      overrides: [{ meshName: 'body' }],
    }))
    const capped = capBoard({ designs: [...seeds, ...guests] })

    expect(capped).toHaveLength(MAX_LIVE_DESIGNS)
    expect(
      seeds.every((seed) =>
        capped.some((design) => design.id === seed.id),
      ),
    ).toBe(true)
    expect(capped.some((design) => design.id === 'look-guest-19')).toBe(true)
    expect(capped.some((design) => design.id === 'look-guest-0')).toBe(false)
  })

  test('hydrate seeds only when the key is missing', async () => {
    const bucket: { value: ReturnType<typeof createEmptyDesign>[] | null } = {
      value: null,
    }
    const persist: DesignsPersist = {
      async load() {
        if (bucket.value == null) {
          return { status: 'missing' }
        }

        return {
          status: 'ok',
          designs: bucket.value.map((design) => ({ ...design })),
          revision: 1,
        }
      },
      async save({ designs }) {
        bucket.value = designs.map((design) => ({ ...design }))
      },
    }

    resetDesignsStore({ persist })
    await hydrateDesignsStore()

    expect(bucket.value).toHaveLength(8)
    expect(listStoredDesigns()).toHaveLength(8)
  })

  test('hydrate does not save when load errors', async () => {
    const writes: unknown[] = []
    resetDesignsStore({
      persist: {
        async load() {
          return { status: 'error' }
        },
        async save({ designs }) {
          writes.push(designs)
        },
      },
    })

    await hydrateDesignsStore()

    expect(writes).toHaveLength(0)
    expect(listStoredDesigns().some((design) => design.id === 'look-midnight-silk')).toBe(
      true,
    )
  })

  test('hydrate keeps a persisted guest and fills missing house looks', async () => {
    const guest = {
      ...createEmptyDesign({ id: 'look-guest-keep' }),
      title: 'Kept Look',
      author: 'Guest',
      votes: 2,
      thumbnailDataUrl: 'data:image/png;base64,abc',
      overrides: [{ meshName: 'body' }],
    }
    const writes: unknown[] = []
    resetDesignsStore({
      persist: {
        async load() {
          return {
            status: 'ok',
            designs: [guest],
            revision: 3,
          }
        },
        async save({ designs }) {
          writes.push(designs)
        },
      },
    })

    await hydrateDesignsStore()

    expect(writes).toHaveLength(0)
    expect(listStoredDesigns().some((design) => design.id === 'look-guest-keep')).toBe(
      true,
    )
    expect(
      listStoredDesigns().some((design) => design.id === 'look-midnight-silk'),
    ).toBe(true)
    expect(
      listStoredDesigns().some((design) => design.id === 'look-cotton-leather'),
    ).toBe(true)
  })

  test('hydrate adds a new house look without dropping votes', async () => {
    const staleHouse = listStoredDesigns()
      .filter((design) => design.id !== 'look-cotton-leather')
      .map((design) =>
        design.id === 'look-midnight-silk'
          ? { ...design, votes: 12 }
          : design,
      )
    const guest = {
      ...createEmptyDesign({ id: 'look-guest-keep' }),
      title: 'Kept Look',
      author: 'Guest',
      votes: 2,
      thumbnailDataUrl: 'data:image/png;base64,abc',
      overrides: [{ meshName: 'body' }],
    }
    resetDesignsStore({
      persist: {
        async load() {
          return {
            status: 'ok',
            designs: [...staleHouse, guest],
            revision: 4,
          }
        },
        async save() {},
      },
    })

    await hydrateDesignsStore()

    expect(getStoredDesign({ id: 'look-cotton-leather' })?.title).toBe(
      'Cotton and Leather',
    )
    expect(getStoredDesign({ id: 'look-midnight-silk' })?.votes).toBe(12)
    expect(getStoredDesign({ id: 'look-guest-keep' })?.title).toBe('Kept Look')
  })

  test('hydrate does not overwrite a corrupt board', async () => {
    const writes: unknown[] = []
    resetDesignsStore({
      persist: {
        async load() {
          return {
            status: 'ok',
            designs: [{ title: 'broken' } as never],
            revision: 8,
          }
        },
        async save({ designs }) {
          writes.push(designs)
        },
      },
    })

    await hydrateDesignsStore()

    expect(writes).toHaveLength(0)
    expect(
      listStoredDesigns().some((design) => design.id === 'look-midnight-silk'),
    ).toBe(true)
  })

  test('persistDesignsStore retries after a lost write', async () => {
    const seed = listStoredDesigns()
    const remoteOnly = {
      ...createEmptyDesign({ id: 'look-remote-only' }),
      title: 'Remote Only',
      author: 'Guest',
      votes: 1,
      thumbnailDataUrl: 'data:image/png;base64,abc',
      overrides: [{ meshName: 'body' }],
    }
    let saved = seed.map((design) => ({ ...design }))
    let revision = 1
    let saves = 0

    resetDesignsStore({
      persist: {
        async load() {
          return {
            status: 'ok',
            designs: saved.map((design) => ({ ...design })),
            revision,
          }
        },
        async save({ designs, revision: nextRevision }) {
          saves += 1

          if (saves === 1) {
            saved = [...seed, remoteOnly]
            revision = 2
            return
          }

          saved = designs.map((design) => ({ ...design }))
          revision = nextRevision
        },
      },
    })

    const created = createStoredDesign({ draft: DRAFT })
    await persistDesignsStore()

    expect(saves).toBeGreaterThan(1)
    expect(saved.some((design) => design.id === created.id)).toBe(true)
    expect(saved.some((design) => design.id === 'look-remote-only')).toBe(true)
    expect(listStoredDesigns().some((design) => design.id === created.id)).toBe(
      true,
    )
  })
})
