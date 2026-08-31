import { describe, expect, test } from 'vitest'

import {
  createDesignsPersist,
  createKvPersist,
  createMemoryPersist,
  isKvConfigured,
} from './designs-persist'
import { createEmptyDesign } from './design-schema'

describe('designs persist', () => {
  test('isKvConfigured needs both env values', () => {
    expect(isKvConfigured({ env: {} })).toBe(false)
    expect(
      isKvConfigured({
        env: { KV_REST_API_URL: 'https://example.com' },
      }),
    ).toBe(false)
    expect(
      isKvConfigured({
        env: {
          KV_REST_API_URL: 'https://example.com',
          KV_REST_API_TOKEN: 'token',
        },
      }),
    ).toBe(true)
  })

  test('memory persist round-trips looks', async () => {
    const persist = createMemoryPersist()
    const design = createEmptyDesign({ id: 'look-1' })

    expect(await persist.load()).toBeNull()

    await persist.save({ designs: [design] })

    const loaded = await persist.load()
    expect(loaded?.[0]?.id).toBe('look-1')
    expect(loaded?.[0]).not.toBe(design)
  })

  test('kv persist uses the fake client', async () => {
    const bucket = new Map<string, ReturnType<typeof createEmptyDesign>[]>()
    const persist = createKvPersist({
      client: {
        async get(key) {
          return bucket.get(key) ?? null
        },
        async set(key, value) {
          bucket.set(key, value)
        },
      },
    })
    const design = createEmptyDesign({ id: 'look-kv' })

    expect(await persist.load()).toBeNull()
    await persist.save({ designs: [design] })
    expect((await persist.load())?.[0]?.id).toBe('look-kv')
  })

  test('factory uses memory when KV is unset', async () => {
    const persist = createDesignsPersist({ env: {} })
    expect(await persist.load()).toBeNull()
  })

  test('kv persist talks REST when no client is passed', async () => {
    const store = new Map<string, string>()
    const originalFetch = globalThis.fetch
    const calls: string[] = []

    globalThis.fetch = (async (input, init) => {
      calls.push(String(input))
      const command = JSON.parse(String(init?.body)) as unknown[]

      if (command[0] === 'GET') {
        return new Response(
          JSON.stringify({ result: store.get(String(command[1])) ?? null }),
        )
      }

      if (command[0] === 'SET') {
        store.set(String(command[1]), String(command[2]))
        return new Response(JSON.stringify({ result: 'OK' }))
      }

      return new Response('no', { status: 500 })
    }) as typeof fetch

    try {
      const persist = createKvPersist({
        env: {
          KV_REST_API_URL: 'https://kv.test',
          KV_REST_API_TOKEN: 'token',
        },
      })
      const design = createEmptyDesign({ id: 'look-rest' })

      await persist.save({ designs: [design] })

      expect(calls[0]).toBe('https://kv.test')
      expect((await persist.load())?.[0]?.id).toBe('look-rest')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
