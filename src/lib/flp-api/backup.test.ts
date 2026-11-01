import { describe, expect, test } from 'vitest'

import { PUBLIC_RENDER_KINDS as BACKUP_RENDER_KINDS, canonicalContentHash } from '../../../scripts/backup-lib.mjs'
import { hashCanonicalDocument } from '../canonical-hash'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import type { CanonicalDocument } from '../canonical-document'
import { PUBLIC_RENDER_KINDS } from './publication'

// The restore check re-hashes stored content in plain Node (Q09 #194); it
// must agree with the app's hash, or every restored version would fail.

describe('backup-lib content hash', () => {
  test('matches the app hash for the golden document', async () => {
    expect(canonicalContentHash(GOLDEN_DOCUMENT)).toBe(await hashCanonicalDocument({ document: GOLDEN_DOCUMENT }))
  })

  test('matches after a jsonb-style round trip: keys reordered, unnormalized strings and numbers', async () => {
    const odd = { ...GOLDEN_DOCUMENT, zeta: -0.0000001, title: 'Cafe\u0301', alpha: [1.23456789, { b: 1, a: 'é' }] }
    const reordered = Object.fromEntries(Object.entries(odd).reverse())
    const document = odd as unknown as CanonicalDocument

    expect(canonicalContentHash(reordered)).toBe(await hashCanonicalDocument({ document }))
  })

  test('checks the same public render kinds as the app', () => {
    expect(BACKUP_RENDER_KINDS).toEqual([...PUBLIC_RENDER_KINDS])
  })
})
