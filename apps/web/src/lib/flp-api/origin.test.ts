import { describe, expect, test } from 'vitest'

import { crossOriginMutation, handleFlpRequest } from './server'

/** Origin policy for `/api/flp` mutations (Q02 #187). */

function request({ method, origin }: { method: string; origin?: string }) {
  return new Request('https://flp.example/api/flp/designs', {
    method,
    headers: origin === undefined ? {} : { Origin: origin },
  })
}

describe('crossOriginMutation', () => {
  test.each(['POST', 'PATCH', 'DELETE', 'PUT'])('%s from another origin is refused', (method) => {
    expect(crossOriginMutation({ request: request({ method, origin: 'https://evil.example' }) })).toBe(true)
  })

  test('same origin and no Origin are allowed', () => {
    expect(crossOriginMutation({ request: request({ method: 'POST', origin: 'https://flp.example' }) })).toBe(false)
    expect(crossOriginMutation({ request: request({ method: 'POST' }) })).toBe(false)
  })

  test('another scheme, port or subdomain of the same site is cross-origin', () => {
    for (const origin of ['http://flp.example', 'https://flp.example:8443', 'https://www.flp.example', 'null']) {
      expect(crossOriginMutation({ request: request({ method: 'DELETE', origin }) })).toBe(true)
    }
  })

  test('reads are not checked', () => {
    expect(crossOriginMutation({ request: request({ method: 'GET', origin: 'https://evil.example' }) })).toBe(false)
  })
})

describe('handleFlpRequest', () => {
  test('refuses a cross-origin mutation before anything else', async () => {
    const response = await handleFlpRequest({
      env: null,
      request: request({ method: 'POST', origin: 'https://evil.example' }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'cross_origin', message: 'Cross-origin requests are not allowed' },
    })
  })
})
