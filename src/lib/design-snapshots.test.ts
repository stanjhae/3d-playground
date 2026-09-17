import { describe, expect, test } from 'vitest'

import { createEmptyDocument, createObjectId } from './design-document'
import { createSnapshot, parseSnapshots } from './design-snapshots'

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
    expect(parsed[0]?.document.layers[0]?.kind).toBe('paint')
  })
})
