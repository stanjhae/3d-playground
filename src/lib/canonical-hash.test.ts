import { describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { GOLDEN_DOCUMENT } from './canonical-fixtures'
import {
  hashCanonicalDocument,
  normalizeCanonicalDocument,
  roundCanonicalNumber,
  serializeCanonicalDocument,
} from './canonical-hash'

const GOLDEN_HASH = 'sha256:e081116ffc8971eccb2c8b466f21bf289306bbec33a906e6bd173fc542843b56'

function edited(edit: (document: any) => void): CanonicalDocument {
  const document = structuredClone(GOLDEN_DOCUMENT)
  edit(document)
  return document
}

describe('hashCanonicalDocument', () => {
  test('golden document has a pinned hash', async () => {
    expect(validateCanonicalDocument({ value: GOLDEN_DOCUMENT }).ok).toBe(true)
    expect(await hashCanonicalDocument({ document: GOLDEN_DOCUMENT })).toBe(
      GOLDEN_HASH,
    )
  })

  test('save and reload keep the content and the hash', async () => {
    const stored = serializeCanonicalDocument({ document: GOLDEN_DOCUMENT })
    const reloaded = JSON.parse(stored) as CanonicalDocument

    expect(validateCanonicalDocument({ value: reloaded })).toEqual({
      ok: true,
      document: GOLDEN_DOCUMENT,
    })
    expect(serializeCanonicalDocument({ document: reloaded })).toBe(stored)
    expect(await hashCanonicalDocument({ document: reloaded })).toBe(
      GOLDEN_HASH,
    )
  })

  test('key order does not change the hash', async () => {
    const { panels, base, template, schemaVersion } = GOLDEN_DOCUMENT
    const reordered = { panels, base, template, schemaVersion }

    expect(await hashCanonicalDocument({ document: reordered })).toBe(
      GOLDEN_HASH,
    )
  })

  test('text is compared in NFC', async () => {
    const decomposed = edited((d) => {
      d.panels.back.layers[0].content = 'Café 26'
    })

    expect(await hashCanonicalDocument({ document: decomposed })).toBe(
      GOLDEN_HASH,
    )
  })

  test('numbers compare at six decimals', async () => {
    const noise = edited((d) => {
      d.panels.front.layers[1].x = 0.5000004
    })
    const moved = edited((d) => {
      d.panels.front.layers[1].x = 0.500001
    })

    expect(await hashCanonicalDocument({ document: noise })).toBe(GOLDEN_HASH)
    expect(await hashCanonicalDocument({ document: moved })).not.toBe(
      GOLDEN_HASH,
    )
  })

  test('any content edit changes the hash', async () => {
    const hidden = edited((d) => {
      d.panels.back.layers[0].visible = false
    })

    expect(await hashCanonicalDocument({ document: hidden })).not.toBe(
      GOLDEN_HASH,
    )
  })
})

describe('normalizeCanonicalDocument', () => {
  test('a raw π rotation stays valid once rounded up for storage', () => {
    const turned = edited((d) => {
      d.panels.front.layers[1].rotation = Math.PI
    })
    const normalized = normalizeCanonicalDocument({ document: turned })

    expect(validateCanonicalDocument({ value: turned }).ok).toBe(true)
    expect((normalized.panels.front.layers[1] as { rotation: number }).rotation).toBe(
      3.141593,
    )
    expect(validateCanonicalDocument({ value: normalized }).ok).toBe(true)
  })

  test('writes negative zero as zero', () => {
    expect(Object.is(roundCanonicalNumber({ value: -0.0000001 }), 0)).toBe(true)
  })

  test('refuses non-finite numbers', () => {
    const broken = edited((d) => {
      d.panels.front.layers[1].x = Number.NaN
    })

    expect(() => normalizeCanonicalDocument({ document: broken })).toThrow(
      /non-finite/,
    )
  })
})
