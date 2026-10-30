import { describe, expect, test } from 'vitest'

import { type CanonicalDocument, createEmptyCanonicalDocument } from './canonical-document'
import type { FlpResult } from './flp-api/client'
import type { VersionResponse } from './flp-api/contract'
import { type SaveRequest, createSaveController, imagesReady } from './save-controller'

type Pending = {
  request: SaveRequest
  resolve: (result: FlpResult<VersionResponse>) => void
}

function harness({ headSeq = 1, revision = 10 } = {}) {
  const timers: Array<{ callback: () => void; ms: number }> = []
  const requests: Pending[] = []
  const acks: number[] = []
  let keyCount = 0

  const controller = createSaveController({
    designId: 'd1',
    headSeq,
    revision,
    newKey: () => `key-${++keyCount}`,
    setTimer: (callback, ms) => {
      const timer = { callback, ms }
      timers.push(timer)
      return timer
    },
    clearTimer: (handle) => {
      const index = timers.indexOf(handle as (typeof timers)[number])
      if (index >= 0) timers.splice(index, 1)
    },
    save: (request) =>
      new Promise((resolve) => {
        requests.push({ request, resolve })
      }),
    onAcknowledged: ({ headSeq: seq }) => acks.push(seq),
  })

  return {
    controller,
    requests,
    acks,
    timers,
    /** Fire every pending timer, as if time passed. */
    async tick() {
      const due = timers.splice(0)
      due.forEach((timer) => timer.callback())
      await Promise.resolve()
    },
  }
}

const doc = (text: string): CanonicalDocument => {
  const document = createEmptyCanonicalDocument()
  document.base = { kind: 'solid', color: text.length % 2 ? '#111318' : '#f4ead4' }
  return document
}

function ok(seq: number): FlpResult<VersionResponse> {
  return {
    ok: true,
    data: { designId: 'd1', seq, kind: 'autosave', contentHash: 'sha256:x', restoredFromSeq: null, createdAt: '' },
  }
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('save controller', () => {
  test('waits for 2s of quiet, then saves the latest revision against the acknowledged head', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.notify({ revision: 12, document: doc('ab') })

    expect(h.timers).toHaveLength(1)
    expect(h.timers[0]?.ms).toBe(2000)
    expect(h.controller.getState().status).toBe('unsaved')

    await h.tick()

    expect(h.requests).toHaveLength(1)
    expect(h.requests[0]?.request).toMatchObject({ revision: 12, baseSeq: 1, designId: 'd1' })
    expect(h.controller.getState().status).toBe('saving')
  })

  test('edits during an in-flight save are never marked saved by its acknowledgement', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    h.controller.notify({ revision: 12, document: doc('ab') })
    h.controller.notify({ revision: 13, document: doc('abc') })

    expect(h.requests).toHaveLength(1)

    h.requests[0]!.resolve(ok(2))
    await flushMicrotasks()

    expect(h.controller.getState()).toMatchObject({ savedRevision: 11, headSeq: 2, status: 'unsaved' })

    await h.tick()

    expect(h.requests).toHaveLength(2)
    expect(h.requests[1]?.request).toMatchObject({ revision: 13, baseSeq: 2 })

    h.requests[1]!.resolve(ok(3))
    await flushMicrotasks()

    expect(h.controller.getState()).toMatchObject({ status: 'saved', savedRevision: 13, headSeq: 3 })
    expect(h.acks).toEqual([2, 3])
  })

  test('rapid edits never overlap: one in flight, one coalesced pending', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()

    for (let revision = 12; revision < 30; revision += 1) {
      h.controller.notify({ revision, document: doc(String(revision)) })
      await h.tick()
    }

    expect(h.requests).toHaveLength(1)
  })

  test('a failed network save retries the same revision with the same key', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    h.requests[0]!.resolve({ ok: false, code: 'network', message: 'offline' })
    await flushMicrotasks()

    expect(h.controller.getState().status).toBe('offline')

    await h.tick()

    expect(h.requests[1]?.request.mutationKey).toBe(h.requests[0]?.request.mutationKey)
    expect(h.requests[1]?.request.revision).toBe(11)
  })

  test('rate limited: pauses, ignores edits until the server wait ends, then retries the same key', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    h.requests[0]!.resolve({ ok: false, code: 'rate_limited', message: 'Too many requests', retryAfter: 30 })
    await flushMicrotasks()

    expect(h.controller.getState()).toMatchObject({ status: 'paused', savedRevision: 10 })
    expect(h.timers.map((timer) => timer.ms)).toEqual([30_000])

    // An edit during the pause keeps the scheduled retry.
    h.controller.notify({ revision: 12, document: doc('ab') })
    expect(h.controller.getState().status).toBe('paused')
    expect(h.timers.map((timer) => timer.ms)).toEqual([30_000])

    await h.tick()

    expect(h.requests).toHaveLength(2)
    expect(h.requests[1]?.request.revision).toBe(12)
    h.requests[1]!.resolve(ok(2))
    await flushMicrotasks()
    expect(h.controller.getState()).toMatchObject({ status: 'saved', savedRevision: 12 })
  })

  test('a stale base becomes a conflict and stops saving', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    h.requests[0]!.resolve({ ok: false, code: 'conflict', message: 'stale base version', headSeq: 5 })
    await flushMicrotasks()

    h.controller.notify({ revision: 12, document: doc('ab') })
    await h.tick()
    h.controller.flush()

    expect(h.controller.getState().status).toBe('conflict')
    expect(h.requests).toHaveLength(1)
  })

  test('cancelling (navigation or account switch) drops a late acknowledgement', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    h.controller.cancel()
    h.requests[0]!.resolve(ok(2))
    await flushMicrotasks()

    expect(h.controller.getState()).toMatchObject({ savedRevision: 10, headSeq: 1 })
    expect(h.acks).toEqual([])
  })

  test('an account change reported by the client cancels without saving', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    h.requests[0]!.resolve({ ok: false, code: 'account-changed', message: 'Account changed' })
    await flushMicrotasks()

    expect(h.controller.getState().savedRevision).toBe(10)
    expect(h.timers).toHaveLength(0)
  })

  test('a design with unuploaded images waits instead of saving', async () => {
    const h = harness()
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers.push({
      id: 'img', kind: 'image', visible: true, opacity: 1, x: 0.5, y: 0.5, scale: 0.3, rotation: 0,
      assetId: 'asset_legacy_0123456789abcdef', aspect: 1,
    })

    h.controller.notify({ revision: 11, document })
    h.controller.flush()

    expect(h.controller.getState().status).toBe('waiting-for-images')
    expect(h.requests).toHaveLength(0)
  })

  test('a finalized upload id saves like a library graphic', () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers.push({
      id: 'img', kind: 'image', visible: true, opacity: 1, x: 0.5, y: 0.5, scale: 0.3, rotation: 0,
      assetId: 'asset_0123456789abcdef', aspect: 2,
    })

    expect(imagesReady({ document })).toBe(true)
  })
})

describe('checkpoints, settle and hold (S07 #176, S08 #177)', () => {
  test('a checkpoint waits for the save in flight, then saves against its head', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    const checkpoint = h.controller.checkpoint({ label: 'Before sleeves', revision: 12, document: doc('ab') })
    await flushMicrotasks()

    expect(h.requests).toHaveLength(1)

    h.requests[0]!.resolve(ok(2))
    await flushMicrotasks()

    expect(h.requests).toHaveLength(2)
    expect(h.requests[1]?.request).toMatchObject({ kind: 'checkpoint', label: 'Before sleeves', baseSeq: 2, revision: 12 })

    h.requests[1]!.resolve(ok(3))
    expect((await checkpoint).ok).toBe(true)
    expect(h.controller.getState()).toMatchObject({ status: 'saved', headSeq: 3, savedRevision: 12 })
    expect(h.acks).toEqual([2, 3])
  })

  test('autosave started during a checkpoint never races it', async () => {
    const h = harness()

    const checkpoint = h.controller.checkpoint({ label: 'Named', revision: 10, document: doc('a') })
    h.controller.notify({ revision: 11, document: doc('ab') })
    await h.tick()

    expect(h.requests).toHaveLength(1)

    h.requests[0]!.resolve(ok(2))
    await checkpoint
    await h.tick()

    expect(h.requests).toHaveLength(2)
    expect(h.requests[1]?.request).toMatchObject({ baseSeq: 2, revision: 11 })
    expect(h.requests[1]?.request.kind).toBeUndefined()
  })

  test('a failed checkpoint leaves pending edits to autosave', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    const checkpoint = h.controller.checkpoint({ label: 'Named', revision: 11, document: doc('a') })
    h.requests[0]!.resolve({ ok: false, code: 'invalid', message: 'Name the checkpoint' })

    expect(await checkpoint).toMatchObject({ ok: false, code: 'invalid' })
    expect(h.controller.getState()).toMatchObject({ status: 'unsaved', headSeq: 1 })
    expect(h.timers).toHaveLength(1)
  })

  test('settle saves pending work now and reports the outcome', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    const settled = h.controller.settle()
    await flushMicrotasks()

    expect(h.requests).toHaveLength(1)
    h.requests[0]!.resolve(ok(2))

    expect(await settled).toMatchObject({ status: 'saved', headSeq: 2, savedRevision: 11 })
  })

  test('settle reports a failure instead of hanging', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    const settled = h.controller.settle()
    await flushMicrotasks()
    h.requests[0]!.resolve({ ok: false, code: 'network', message: 'offline' })

    expect((await settled).status).toBe('offline')
  })

  test('hold waits for the save in flight and starts no more until released', async () => {
    const h = harness()

    h.controller.notify({ revision: 11, document: doc('a') })
    h.controller.flush()
    h.controller.notify({ revision: 12, document: doc('ab') })
    const held = h.controller.hold()
    h.requests[0]!.resolve(ok(2))

    expect(await held).toMatchObject({ headSeq: 2 })

    await h.tick()
    h.controller.flush()
    expect(h.requests).toHaveLength(1)

    h.controller.release()
    await h.tick()
    expect(h.requests).toHaveLength(2)
    expect(h.requests[1]?.request).toMatchObject({ revision: 12, baseSeq: 2 })
  })
})
