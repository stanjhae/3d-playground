import { describe, expect, test } from 'vitest'

import { canonicalContentHash, pgCommand, urlForDatabase } from '../../../scripts/backup-lib.mjs'
import { hashCanonicalDocument } from '../canonical-hash'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import type { CanonicalDocument } from '../canonical-document'

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
})

// The scheduled hosted backup (P1) reaches Postgres by URL; the local stack by container.
describe('backup-lib database target', () => {
  const url = 'postgresql://postgres.abc:p%40ss@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'

  test('a URL keeps its user, password, host and options, with the database swapped', () => {
    const restored = new URL(urlForDatabase({ url, database: 'flp_restore' }))
    expect(restored.pathname).toBe('/flp_restore')
    expect(restored.username).toBe('postgres.abc')
    expect(restored.password).toBe('p%40ss')
    expect(restored.host).toBe('aws-0-eu-west-1.pooler.supabase.com:5432')
    expect(restored.searchParams.get('sslmode')).toBe('require')
  })

  test('with a URL the tools run on this machine; with a container, inside it', () => {
    const [local, localArgs] = pgCommand({ container: 'supabase_db_x', tool: 'pg_restore', database: 'flp_restore', args: ['--no-owner'] })
    expect(local).toBe('docker')
    expect(localArgs).toEqual(['exec', '-i', 'supabase_db_x', 'pg_restore', '-U', 'supabase_admin', '-d', 'flp_restore', '--no-owner'])

    const [hosted, hostedArgs] = pgCommand({ url, tool: 'pg_dump', args: ['--format=custom'] })
    expect(hosted).toBe('pg_dump')
    expect(hostedArgs[0]).toBe(`--dbname=${urlForDatabase({ url, database: 'postgres' })}`)
    expect(hostedArgs.slice(1)).toEqual(['--format=custom'])
  })

  test('without either, it refuses rather than guessing', () => {
    expect(() => pgCommand({ tool: 'psql' })).toThrow(/container or a connection URL/)
  })
})
