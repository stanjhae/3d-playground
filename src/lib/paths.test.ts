import { describe, expect, test } from 'vitest'

import { lookIdFromPathname, resolveVoteId } from './paths'

describe('lookIdFromPathname', () => {
  test('reads the current look id', () => {
    expect(lookIdFromPathname({ pathname: '/look/silk-01' })).toBe('silk-01')
  })

  test('returns null off the look route', () => {
    expect(lookIdFromPathname({ pathname: '/vote' })).toBeNull()
  })
})

describe('resolveVoteId', () => {
  test('prefers Vercel params', async () => {
    const id = await resolveVoteId({
      request: new Request('https://example.com/api/designs/ignored/vote'),
      params: { id: 'from-params' },
    })

    expect(id).toBe('from-params')
  })

  test('awaits promised params', async () => {
    const id = await resolveVoteId({
      request: new Request('https://example.com/api/designs/ignored/vote'),
      params: Promise.resolve({ id: 'async-id' }),
    })

    expect(id).toBe('async-id')
  })

  test('reads /api/designs/:id/vote when params are missing', async () => {
    const id = await resolveVoteId({
      request: new Request('https://example.com/api/designs/abc/vote'),
    })

    expect(id).toBe('abc')
  })

  test('does not treat designs as the id', async () => {
    const id = await resolveVoteId({
      request: new Request('https://example.com/api/designs/vote'),
    })

    expect(id).toBe('unknown')
  })

  test('reads a rewritten voteId query', async () => {
    const id = await resolveVoteId({
      request: new Request(
        'https://example.com/api/designs?voteId=look-atelier-ivory',
      ),
    })

    expect(id).toBe('look-atelier-ivory')
  })
})
