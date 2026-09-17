import { beforeEach, describe, expect, test, vi } from 'vitest'

import { parseAssumptionEvent } from './assumption-events'
import {
  allowPublicWrite,
  handleWaitlistRequest,
  resetPublicWriteGuards,
} from './waitlist-handlers'
import {
  addWaitlistEmail,
  incrementAssumption,
  listAssumptionCounts,
  parseStoredCounts,
  parseStoredList,
  parseWaitlistEmail,
  resetWaitlistStore,
} from './waitlist-store'

describe('waitlist', () => {
  beforeEach(() => {
    resetWaitlistStore()
    resetPublicWriteGuards()
  })

  test('reads a Redis string as the current list', () => {
    expect(
      parseStoredList({ result: JSON.stringify(['max@house.test']) }),
    ).toEqual(['max@house.test'])
    expect(parseStoredList({ result: ['guest@house.test'] })).toEqual([
      'guest@house.test',
    ])
    expect(parseStoredCounts({ result: JSON.stringify({ voted: 3 }) })).toEqual({
      voted: 3,
    })
  })

  test('keeps prior Redis emails when GET returns a string', async () => {
    const store = { value: JSON.stringify(['a@house.test']) }

    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body ?? '[]')) as unknown[]

      if (command[0] === 'GET') {
        return {
          ok: true,
          json: async () => ({ result: store.value }),
        }
      }

      store.value = String(command[2] ?? '[]')
      return {
        ok: true,
        json: async () => ({ result: 'OK' }),
      }
    })

    await addWaitlistEmail({
      email: 'b@house.test',
      env: {
        KV_REST_API_URL: 'https://kv.test',
        KV_REST_API_TOKEN: 'token',
      },
    })

    expect(JSON.parse(store.value)).toEqual(['a@house.test', 'b@house.test'])
    vi.unstubAllGlobals()
  })

  test('accepts a real address and rejects a fake one', () => {
    expect(parseWaitlistEmail({ value: 'max@house.test' })).toBe('max@house.test')
    expect(parseWaitlistEmail({ value: 'not-an-email' })).toBeNull()
  })

  test('stores an address in memory', async () => {
    const result = await addWaitlistEmail({ email: 'guest@house.test' })
    expect(result.ok).toBe(true)
  })

  test('caps public waitlist writes', async () => {
    expect(
      allowPublicWrite({ key: 'waitlist:1.1.1.1', max: 2, windowMs: 60_000 }),
    ).toBe(true)
    expect(
      allowPublicWrite({ key: 'waitlist:1.1.1.1', max: 2, windowMs: 60_000 }),
    ).toBe(true)
    expect(
      allowPublicWrite({ key: 'waitlist:1.1.1.1', max: 2, windowMs: 60_000 }),
    ).toBe(false)

    const join = () =>
      handleWaitlistRequest({
        request: new Request('http://local/api/waitlist', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '9.9.9.9',
          },
          body: JSON.stringify({ email: 'cap@house.test' }),
        }),
      })

    for (let index = 0; index < 8; index += 1) {
      const response = await join()
      expect(response.status).toBe(201)
    }

    const blocked = await join()
    expect(blocked.status).toBe(429)
    const body = (await blocked.json()) as { ok?: boolean; count?: number }
    expect(body.ok).toBeUndefined()
    expect(body.count).toBeUndefined()
  })
})

describe('assumptions', () => {
  beforeEach(() => {
    resetWaitlistStore()
  })

  test('increments Redis counts when GET returns a string', async () => {
    const store = { value: JSON.stringify({ viewed_demo: 4 }) }

    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body ?? '[]')) as unknown[]

      if (command[0] === 'GET') {
        return {
          ok: true,
          json: async () => ({ result: store.value }),
        }
      }

      store.value = String(command[2] ?? '{}')
      return {
        ok: true,
        json: async () => ({ result: 'OK' }),
      }
    })

    await incrementAssumption({
      name: 'viewed_demo',
      env: {
        KV_REST_API_URL: 'https://kv.test',
        KV_REST_API_TOKEN: 'token',
      },
    })

    expect(JSON.parse(store.value)).toEqual({ viewed_demo: 5 })
    vi.unstubAllGlobals()
  })

  test('only counts named events', () => {
    expect(parseAssumptionEvent({ value: 'started_drawing' })).toBe(
      'started_drawing',
    )
    expect(parseAssumptionEvent({ value: 'vibes' })).toBeNull()
  })

  test('increments a named count', async () => {
    await incrementAssumption({ name: 'viewed_demo' })
    expect(listAssumptionCounts().viewed_demo).toBeGreaterThan(0)
  })
})
