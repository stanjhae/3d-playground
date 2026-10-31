import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { createCopyAttempt } from './copy-attempt'
import type { FlpResult } from './flp-api/client'
import type { CreateDesignRequest, VersionResponse } from './flp-api/contract'

const document = createEmptyCanonicalDocument()
const ok = { ok: true, data: { designId: 'copy', seq: 1 } } as unknown as FlpResult<VersionResponse>
const lost: FlpResult<VersionResponse> = { ok: false, code: 'network', message: 'Could not reach the server' }

function harness(results: Array<FlpResult<VersionResponse>>) {
  const sent: CreateDesignRequest[] = []
  const gates: Array<() => void> = []
  let keys = 0
  const attempt = createCopyAttempt({
    newKey: () => `key-${(keys += 1)}`,
    create: (request) => {
      sent.push(request)
      const result = results.shift() ?? ok
      return new Promise((resolve) => gates.push(() => resolve(result)))
    },
  })
  return { attempt, sent, release: () => gates.shift()?.() }
}

describe('createCopyAttempt (S06 #175)', () => {
  test('a double click sends one create and both clicks get its result', async () => {
    const { attempt, sent, release } = harness([ok])
    const first = attempt.run({ title: 'Tee (copy)', content: document })
    const second = attempt.run({ title: 'Tee (copy)', content: document })
    expect(attempt.busy()).toBe(true)
    release()

    expect(await first).toBe(ok)
    expect(await second).toBe(ok)
    expect(sent).toHaveLength(1)
    expect(attempt.busy()).toBe(false)
  })

  test('a retry after a failure reuses the key and the first document', async () => {
    const { attempt, sent, release } = harness([lost, ok])
    const failed = attempt.run({ title: 'Tee (copy)', content: document })
    release()
    expect(await failed).toBe(lost)

    const edited = { ...document }
    const retried = attempt.run({ title: 'Tee (copy)', content: edited })
    release()
    expect(await retried).toBe(ok)

    expect(sent.map((request) => request.mutationKey)).toEqual(['key-1', 'key-1'])
    expect(sent[1]).toBe(sent[0])
  })

  test('after success the next copy is a new attempt with a new key', async () => {
    const { attempt, sent, release } = harness([ok, ok])
    const first = attempt.run({ title: 'Tee (copy)', content: document })
    release()
    await first
    const second = attempt.run({ title: 'Tee (copy)', content: document })
    release()
    await second

    expect(sent.map((request) => request.mutationKey)).toEqual(['key-1', 'key-2'])
  })
})
