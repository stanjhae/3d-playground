import { describe, expect, test } from 'vitest'

import { fixtureTeePattern } from '../pattern/pattern-fixtures'
import { DrapeCancelled, createDrapeClient } from './cloth-client'
import { type DrapeMessage, type DrapeRequest, type DrapedMesh, runDrapeJob } from './drape-job'

function cannedMesh(): DrapedMesh {
  return {
    positions: new Float32Array(9),
    normals: new Float32Array(9),
    indices: Uint32Array.from([0, 1, 2]),
    flat: new Float32Array(6),
    pieceOf: new Uint16Array(3),
    pieceIds: ['front'],
    solverVersion: 1,
    settled: true,
    seconds: 1,
  }
}

/** A worker that answers after a tick, or never when `hold` is set. */
function fakeWorkers({ hold = false } = {}) {
  const spawned: { terminated: boolean; requests: DrapeRequest[] }[] = []

  const spawn = () => {
    const record = { terminated: false, requests: [] as DrapeRequest[] }
    spawned.push(record)
    const worker = {
      onmessage: null as ((event: MessageEvent<DrapeMessage>) => void) | null,
      onerror: null,
      terminate: () => {
        record.terminated = true
      },
      postMessage: (request: DrapeRequest) => {
        record.requests.push(request)

        const answer = () => {
          worker.onmessage?.({ data: { type: 'progress', job: request.job, fraction: 0.5 } } as MessageEvent<DrapeMessage>)
          worker.onmessage?.({ data: { type: 'done', job: request.job, mesh: cannedMesh() } } as MessageEvent<DrapeMessage>)
        }

        // A held worker never answers.
        if (!hold) {
          setTimeout(answer)
        }
      },
    }
    return worker
  }

  return { spawn, spawned }
}

describe('the drape job', () => {
  test('drapes the fixture tee and hands back a render-ready mesh', () => {
    const messages: DrapeMessage[] = []
    runDrapeJob({ type: 'drape', job: 3, pattern: fixtureTeePattern() }, (message) => messages.push(message))

    const done = messages.at(-1)!
    expect(done.type).toBe('done')
    expect(messages.some((message) => message.type === 'progress')).toBe(true)

    if (done.type === 'done') {
      const { mesh } = done
      const vertices = mesh.positions.length / 3
      expect(done.job).toBe(3)
      expect(mesh.settled).toBe(true)
      expect(mesh.normals.length).toBe(mesh.positions.length)
      expect(mesh.flat.length).toBe(vertices * 2)
      expect(mesh.pieceOf.length).toBe(vertices)
      expect(Math.max(...mesh.indices)).toBeLessThan(vertices)
      expect(mesh.pieceIds).toEqual(['front', 'back', 'sleeveR', 'sleeveL'])
      expect(Math.hypot(mesh.normals[0]!, mesh.normals[1]!, mesh.normals[2]!)).toBeCloseTo(1, 5)
    }
  }, 20_000)

  test('a pattern that cannot be built fails cleanly', () => {
    const pattern = fixtureTeePattern()
    pattern.seams[0]!.a.to = 'nowhere'
    const messages: DrapeMessage[] = []
    runDrapeJob({ type: 'drape', job: 1, pattern }, (message) => messages.push(message))
    expect(messages).toEqual([{ type: 'failed', job: 1, message: 'Seam point nowhere is not on front' }])
  })
})

describe('the drape client', () => {
  test('reports progress, then caches the result by pattern', async () => {
    const { spawn, spawned } = fakeWorkers()
    const client = createDrapeClient({ spawn })
    const progress: number[] = []

    const mesh = await client.drape({ pattern: fixtureTeePattern(), onProgress: (fraction) => progress.push(fraction) })
    expect(mesh.settled).toBe(true)
    expect(progress).toEqual([0.5, 1])
    expect(spawned[0]!.terminated).toBe(true)

    // The same pattern again: no new worker.
    await client.drape({ pattern: fixtureTeePattern() })
    expect(spawned).toHaveLength(1)
    expect(client.runs).toBe(1)
    expect(await client.cached({ pattern: fixtureTeePattern() })).toBe(mesh)
    expect(await client.cached({ pattern: fixtureTeePattern(), build: 'female' })).toBeNull()
  })

  test('a newer drape cancels the one still running', async () => {
    const held = fakeWorkers({ hold: true })
    const client = createDrapeClient({ spawn: held.spawn })
    const first = client.drape({ pattern: fixtureTeePattern() })
    // Let the first reach its worker.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const changed = fixtureTeePattern()
    changed.pieces[0]!.outline![0]!.y = -5
    const second = client.drape({ pattern: changed })

    await expect(first).rejects.toBeInstanceOf(DrapeCancelled)
    expect(held.spawned[0]!.terminated).toBe(true)
    client.cancel()
    await expect(second).rejects.toBeInstanceOf(DrapeCancelled)
  })

  test('asking again for the same pattern joins the running drape instead of cancelling it', async () => {
    const { spawn, spawned } = fakeWorkers()
    const client = createDrapeClient({ spawn })
    const progress: number[] = []
    const first = client.drape({ pattern: fixtureTeePattern() })
    const second = client.drape({ pattern: fixtureTeePattern(), onProgress: (fraction) => progress.push(fraction) })

    const [a, b] = await Promise.all([first, second])
    // One drape whichever way the two callers' hashes race: the second
    // joins the running one or, if it finished first, takes it from the
    // cache. Either way it hears that it's done.
    expect(a).toBe(b)
    expect(spawned).toHaveLength(1)
    expect(client.runs).toBe(1)
    expect(progress.at(-1)).toBe(1)
    expect([[0.5, 1], [1]]).toContainEqual(progress)
  })

  test('a caller served from the cache still hears that the drape is done', async () => {
    const { spawn } = fakeWorkers()
    const client = createDrapeClient({ spawn })
    await client.drape({ pattern: fixtureTeePattern() })
    const progress: number[] = []
    await client.drape({ pattern: fixtureTeePattern(), onProgress: (fraction) => progress.push(fraction) })
    expect(progress).toEqual([1])
  })

  test('a stored mesh is used without draping', async () => {
    const { spawn, spawned } = fakeWorkers()
    const client = createDrapeClient({ spawn })
    const stored = cannedMesh()
    await client.remember({ pattern: fixtureTeePattern(), mesh: stored })
    expect(await client.drape({ pattern: fixtureTeePattern() })).toBe(stored)
    expect(spawned).toHaveLength(0)
    expect(client.runs).toBe(0)
  })
})
