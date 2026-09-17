import { describe, expect, test } from 'vitest'

import { createEmptyDocument, createObjectId } from './design-document'
import {
  SNAPSHOT_STORAGE_KEY,
  createSnapshot,
  mergeSnapshots,
  parseSnapshots,
  rememberSnapshot,
  writeSnapshots,
} from './design-snapshots'

describe('design snapshots', () => {
  test('keeps a named morning', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    if (document.layers[0]?.kind === 'paint') {
      document.layers[0].strokes.push({
        id: createObjectId({ prefix: 'ink' }),
        panel: 'front',
        points: [{ x: 0.4, y: 0.4 }],
        color: '#1a1c22',
        width: 0.02,
        tool: 'brush',
      })
    }

    const snapshot = createSnapshot({ title: 'Morning', document })
    const parsed = parseSnapshots({ value: [snapshot] })

    expect(parsed[0]?.title).toBe('Morning')
    expect(parsed[0]?.kind).toBe('morning')
    expect(parsed[0]?.document.layers[0]?.kind).toBe('paint')
  })

  test('keeps a look you entered with its still', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const snapshot = createSnapshot({
      title: 'Crop Silk',
      document,
      kind: 'entered',
      still: '/stills/look-house-ink.png',
      id: 'entered-look-house-ink',
    })
    const parsed = parseSnapshots({ value: [snapshot] })

    expect(parsed[0]?.title).toBe('Crop Silk')
    expect(parsed[0]?.kind).toBe('entered')
    expect(parsed[0]?.still).toBe('/stills/look-house-ink.png')
  })

  test('entered looks do not drop a morning', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const morning = createSnapshot({ title: 'Morning', document })
    let shelf = mergeSnapshots({ next: morning, existing: [] })

    for (let index = 0; index < 6; index += 1) {
      shelf = mergeSnapshots({
        next: createSnapshot({
          title: `Look ${index}`,
          document,
          kind: 'entered',
          still: '/stills/look-house-ink.png',
          id: `entered-look-${index}`,
        }),
        existing: shelf,
      })
    }

    expect(shelf.some((entry) => entry.kind === 'morning')).toBe(true)
    expect(shelf.filter((entry) => entry.kind === 'entered')).toHaveLength(4)
    expect(shelf.filter((entry) => entry.kind === 'morning')).toHaveLength(1)
  })

  test('a full house does not throw when a still will not fit', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const memory: Record<string, string> = {}
    const store = {
      getItem(key: string) {
        return memory[key] ?? null
      },
      setItem(key: string, value: string) {
        if (value.length > 80) {
          throw new Error('quota')
        }

        memory[key] = value
      },
      removeItem(key: string) {
        delete memory[key]
      },
      clear() {
        for (const key of Object.keys(memory)) {
          delete memory[key]
        }
      },
      key: () => null,
      get length() {
        return Object.keys(memory).length
      },
    } satisfies Storage

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: store,
    })

    expect(() => {
      writeSnapshots({
        snapshots: [
          createSnapshot({
            title: 'Ivory Silk 01',
            document,
            kind: 'entered',
            still: `data:image/png;base64,${'a'.repeat(200)}`,
          }),
        ],
      })
    }).not.toThrow()

    expect(() => {
      rememberSnapshot({
        title: 'Ivory Silk 01',
        document,
        kind: 'entered',
        still: `data:image/png;base64,${'a'.repeat(200)}`,
      })
    }).not.toThrow()
    expect(store.getItem(SNAPSHOT_STORAGE_KEY)).toBeTruthy()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
    })
  })
})
