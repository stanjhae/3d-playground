import { describe, expect, test } from 'vitest'

import {
  DESIGNS_KV_KEY,
  createDesignsPersist,
  createKvPersist,
  createMemoryPersist,
  isKvConfigured,
  parseBoardResult,
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

  test('parseBoardResult distinguishes missing, legacy arrays, and bad payloads', () => {
    expect(parseBoardResult({ result: null })).toEqual({ status: 'missing' })
    expect(parseBoardResult({ result: 'not-json' })).toEqual({
      status: 'error',
    })
    expect(parseBoardResult({ result: { looks: [] } })).toEqual({
      status: 'error',
    })

    const legacy = parseBoardResult({
      result: [createEmptyDesign({ id: 'look-1' })],
    })
    expect(legacy).toMatchObject({
      status: 'ok',
      revision: 0,
    })
    if (legacy.status === 'ok') {
      expect(legacy.designs[0]?.id).toBe('look-1')
    }

    const versioned = parseBoardResult({
      result: JSON.stringify({
        revision: 4,
        designs: [createEmptyDesign({ id: 'look-2' })],
      }),
    })
    expect(versioned).toMatchObject({
      status: 'ok',
      revision: 4,
    })
  })

  test('memory persist round-trips looks', async () => {
    const persist = createMemoryPersist()
    const design = createEmptyDesign({ id: 'look-1' })

    expect(await persist.load()).toEqual({ status: 'missing' })

    await persist.save({ designs: [design], revision: 1 })

    const loaded = await persist.load()
    expect(loaded.status).toBe('ok')
    if (loaded.status === 'ok') {
      expect(loaded.designs[0]?.id).toBe('look-1')
      expect(loaded.designs[0]).not.toBe(design)
      expect(loaded.revision).toBe(1)
    }
  })

  test('kv persist uses the fake client', async () => {
    const bucket = new Map<string, string>()
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

    expect(await persist.load()).toEqual({ status: 'missing' })
    await persist.save({ designs: [design], revision: 2 })
    const loaded = await persist.load()
    expect(loaded.status).toBe('ok')
    if (loaded.status === 'ok') {
      expect(loaded.designs[0]?.id).toBe('look-kv')
      expect(loaded.revision).toBe(2)
    }
    expect(bucket.has(DESIGNS_KV_KEY)).toBe(true)
  })

  test('factory uses memory when KV is unset', async () => {
    const persist = createDesignsPersist({ env: {} })
    expect(await persist.load()).toEqual({ status: 'missing' })
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

      await persist.save({ designs: [design], revision: 1 })

      expect(calls[0]).toBe('https://kv.test')
      const loaded = await persist.load()
      expect(loaded.status).toBe('ok')
      if (loaded.status === 'ok') {
        expect(loaded.designs[0]?.id).toBe('look-rest')
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('kv persist reports error when REST fails', async () => {
    const persist = createKvPersist({
      client: {
        async get() {
          throw new Error('down')
        },
        async set() {
          throw new Error('down')
        },
      },
    })

    expect(await persist.load()).toEqual({ status: 'error' })
  })
})
