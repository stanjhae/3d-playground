import { describe, expect, test, vi } from 'vitest'

import { outageLimiter } from '../rate-limit.fake'
import { apiErrorFromDatabase } from './contract'
import { slugFromReport } from './moderation'
import { plainApiMessage } from './plain-messages'
import { handleFlpRequest } from './server'
import { handleSharePage } from './share-page'

/** P2 without a database: public read limits and takedown wording. */

const ENV = { url: 'http://127.0.0.1:1', publishableKey: 'pk', secretKey: 'sk' }
const SHELL = '<!doctype html><html><head><title>Fashion Leader Vote</title></head><body><div id="root"></div></body></html>'

describe('public read limits', () => {
  test('a limited public read is a 429 with a wait, before the database is asked', async () => {
    const response = await handleFlpRequest({
      env: ENV,
      request: new Request('http://localhost/api/flp/public/3f9a1c22b7e04d11'),
      limiter: outageLimiter({ allowed: false, reason: 'limited', retryAfter: 7 }),
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('7')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('rate_limited')
  })

  test('the image read is limited too', async () => {
    const limiter = vi.fn(outageLimiter({ allowed: false, reason: 'limited', retryAfter: 3 }))
    const response = await handleFlpRequest({
      env: ENV,
      request: new Request('http://localhost/api/flp/public/3f9a1c22b7e04d11/image?view=view_front'),
      limiter,
    })

    expect(response.status).toBe(429)
    expect(limiter).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'public_read' }))
  })

  test('signed-in routes do not spend the public budget', async () => {
    const limiter = vi.fn(outageLimiter({ allowed: false, reason: 'limited', retryAfter: 3 }))
    const response = await handleFlpRequest({
      env: ENV,
      request: new Request('http://localhost/api/flp/designs'),
      limiter,
    })

    expect(response.status).toBe(401)
    expect(limiter).not.toHaveBeenCalled()
  })

  test('a limited share page is the plain app with a 429, nothing read or embedded', async () => {
    const response = await handleSharePage({
      env: ENV,
      request: new Request('http://localhost/s/3f9a1c22b7e04d11'),
      loadShell: async () => SHELL,
      limiter: outageLimiter({ allowed: false, reason: 'limited', retryAfter: 9 }),
    })
    const html = await response.text()

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('9')
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('<div id="root"></div>')
    expect(html).not.toContain('flp-public')
  })
})

describe('takedowns', () => {
  test('a held design is refused with its own code and a plain message', () => {
    const error = apiErrorFromDatabase({ code: 'FL451', message: 'this design was taken down after a report' })

    expect(error?.status).toBe(403)
    expect(error?.body.error.code).toBe('taken_down')
    expect(plainApiMessage({ code: 'taken_down', message: error?.body.error.message })).toMatch(/taken down after a report/)
  })

  test.each([
    ['3f9a1c22b7e04d11', '3f9a1c22b7e04d11'],
    ['  3f9a1c22b7e04d11 ', '3f9a1c22b7e04d11'],
    ['https://beta.fashionleadervote.com/s/3f9a1c22b7e04d11', '3f9a1c22b7e04d11'],
    ['https://beta.fashionleadervote.com/s/3f9a1c22b7e04d11/?utm=x', '3f9a1c22b7e04d11'],
    ['https://beta.fashionleadervote.com/look/3f9a1c22b7e04d11', null],
    ['3F9A1C22B7E04D11', null],
    ['nonsense', null],
  ])('reads the slug from a report: %s', (value, slug) => {
    expect(slugFromReport({ value })).toBe(slug)
  })
})
