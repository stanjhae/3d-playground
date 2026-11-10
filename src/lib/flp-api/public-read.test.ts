import { describe, expect, test } from 'vitest'

import { getPublicDesign } from './public-read'

function answering(status: number) {
  return (async () => Response.json({ slug: 'a' }, { status })) as unknown as typeof fetch
}

describe('getPublicDesign', () => {
  test('returns the design', async () => {
    await expect(getPublicDesign({ slug: 'a', fetchImpl: answering(200) })).resolves.toMatchObject({ ok: true })
  })

  test('a 404 is the only answer that means not published', async () => {
    await expect(getPublicDesign({ slug: 'a', fetchImpl: answering(404) })).resolves.toEqual({ ok: false, code: 'not_found' })
  })

  test.each([500, 502, 503, 429])('%i is the service having a problem', async (status) => {
    await expect(getPublicDesign({ slug: 'a', fetchImpl: answering(status) })).resolves.toEqual({ ok: false, code: 'unavailable' })
  })

  test('no answer at all is a network failure', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('failed'))) as unknown as typeof fetch

    await expect(getPublicDesign({ slug: 'a', fetchImpl })).resolves.toEqual({ ok: false, code: 'network' })
  })
})
