import { describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from './canonical-fixtures'
import { loadCloudDesign } from './cloud-design-load'
import { useEditorStore } from './editor-store'
import type { DesignWithHead, FlpResult } from './flp-api/client'

const DESIGN: DesignWithHead = {
  id: 'design-1',
  title: 'Tee',
  visibility: 'private',
  headSeq: 3,
  updatedAt: '2026-10-30T00:00:00Z',
  head: { seq: 3, kind: 'autosave', content: GOLDEN_DOCUMENT, contentHash: 'h', createdAt: '2026-10-30T00:00:00Z' },
}

const failed = (code: 'internal' | 'network' | 'not_found'): FlpResult<DesignWithHead> => ({
  ok: false,
  code,
  message: code,
})

function serving(results: Array<FlpResult<DesignWithHead>>) {
  const calls: string[] = []
  const waits: number[] = []
  return {
    calls,
    waits,
    get: async ({ designId }: { designId: string }) => {
      calls.push(designId)
      return results.shift() ?? { ok: true as const, data: DESIGN }
    },
    wait: async (ms: number) => {
      waits.push(ms)
    },
  }
}

describe('loadCloudDesign (Q05 #190)', () => {
  test('a passing server or network failure is retried before giving up', async () => {
    const server = serving([failed('internal'), failed('network')])
    const result = await loadCloudDesign({ designId: 'design-1', get: server.get, wait: server.wait })

    expect(result).toEqual({ ok: true })
    expect(server.calls).toHaveLength(3)
    expect(useEditorStore.getState().cloud).toMatchObject({ designId: 'design-1', headSeq: 3 })
  })

  test('a design that is really gone is not retried', async () => {
    const server = serving([failed('not_found')])
    expect(await loadCloudDesign({ designId: 'design-1', get: server.get, wait: server.wait })).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(server.calls).toHaveLength(1)
  })

  test('a failure that persists ends as an error, not as missing', async () => {
    const server = serving([failed('internal'), failed('internal'), failed('internal')])
    expect(await loadCloudDesign({ designId: 'design-1', get: server.get, wait: server.wait })).toEqual({
      ok: false,
      reason: 'error',
    })
    expect(server.waits).toEqual([500, 1500])
  })

  test('stops retrying once the caller has moved on', async () => {
    const server = serving([failed('internal')])
    const result = await loadCloudDesign({
      designId: 'design-1',
      get: server.get,
      wait: server.wait,
      isCurrent: () => false,
    })
    expect(result).toEqual({ ok: false, reason: 'account-changed' })
    expect(server.calls).toHaveLength(1)
  })
})
