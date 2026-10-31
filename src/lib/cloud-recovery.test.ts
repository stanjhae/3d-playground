import { beforeEach, describe, expect, test } from 'vitest'

import { useSessionStore } from './auth/session-store'
import { createEmptyCanonicalDocument, type CanonicalDocument } from './canonical-document'
import { startCloudRecovery } from './cloud-autosave'
import {
  type RecoveryStorage,
  clearRecovery,
  deleteRecovery,
  memoryRecoveryStorage,
  readRecovery,
  recoveryKey,
  recoveryOffer,
  writeRecovery,
  withRecoveryTimeout,
} from './cloud-recovery'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import type { FlpResult } from './flp-api/client'
import type { VersionResponse } from './flp-api/contract'
import { createSaveController } from './save-controller'

const A = 'user-a'
const B = 'user-b'
const DESIGN = '0f6e8b8c-3c1d-4f7a-9a52-2f1c5b7e9d10'
/** Two tabs (writers) on the same design. */
const W = 'w-tab-a'
const W2 = 'w-tab-b'

function edited(): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.base = { kind: 'solid', color: '#112233' }
  return document
}

function failing(name: string): RecoveryStorage {
  const fail = async () => {
    throw new DOMException('nope', name)
  }
  return { get: fail, put: fail, delete: fail, keys: fail }
}

describe('recovery keying', () => {
  test('keys name owner, design, writer, schema version and cloud base', () => {
    expect(recoveryKey({ ownerId: A, designId: DESIGN, writerId: W, schemaVersion: 2, baseSeq: 7 })).toBe(
      `recovery/v1/${A}/${DESIGN}/${W}/2/7`,
    )
  })

  test('one record per writer: a new base replaces that writer’s old one', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 1, revision: 3, document: edited() })
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 2, revision: 4, document: edited() })

    expect([...storage.entries.keys()]).toEqual([`recovery/v1/${A}/${DESIGN}/${W}/2/2`])
  })

  test('records hold the document and base, never credentials', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 1, revision: 3, document: edited() })
    const raw = JSON.parse([...storage.entries.values()][0]!)

    expect(Object.keys(raw).sort()).toEqual(
      ['baseSeq', 'designId', 'document', 'ownerId', 'revision', 'savedAt', 'schemaVersion', 'writerId'].sort(),
    )
  })

  test('account B never reads account A’s recovery, even for the same design', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 1, revision: 3, document: edited() })

    expect(await readRecovery({ storage, ownerId: B, designId: DESIGN })).toEqual({ status: 'none' })
    expect((await readRecovery({ storage, ownerId: A, designId: DESIGN })).status).toBe('found')
  })

  test('a record filed under another owner’s key is not trusted', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 1, revision: 3, document: edited() })
    const [value] = [...storage.entries.values()]
    storage.entries.set(recoveryKey({ ownerId: B, designId: DESIGN, writerId: W, schemaVersion: 2, baseSeq: 1 }), value!)

    expect((await readRecovery({ storage, ownerId: B, designId: DESIGN })).status).toBe('corrupt')
  })

  test('clearing a design (it was deleted) removes every writer for that owner only', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 1, revision: 3, document: edited() })
    await writeRecovery({ storage, ownerId: B, designId: DESIGN, writerId: W, baseSeq: 1, revision: 3, document: edited() })
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W2, baseSeq: 1, revision: 3, document: edited() })
    await clearRecovery({ storage, ownerId: A, designId: DESIGN })

    expect([...storage.entries.keys()]).toEqual([`recovery/v1/${B}/${DESIGN}/${W}/2/1`])
  })
})

describe('two tabs on one design', () => {
  const key = (writerId: string, baseSeq: number) =>
    recoveryKey({ ownerId: A, designId: DESIGN, writerId, schemaVersion: 2, baseSeq })

  test('a write by one tab never deletes another tab’s copy', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W2, baseSeq: 1, revision: 3, document: edited() })
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 2, revision: 5, document: edited() })

    expect([...storage.entries.keys()].sort()).toEqual([key(W, 2), key(W2, 1)].sort())
  })

  test('one tab’s acknowledgement clears its own copy only', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W2, baseSeq: 1, revision: 3, document: edited() })
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 2, revision: 5, document: edited() })
    await clearRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W })

    expect([...storage.entries.keys()]).toEqual([key(W2, 1)])
  })

  test('opening offers the newest copy that differs from the cloud, of any writer', async () => {
    const storage = memoryRecoveryStorage()
    const other = edited()
    other.base = { kind: 'solid', color: '#445566' }
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W2, baseSeq: 1, revision: 3, document: edited(), now: 10 })
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 2, revision: 5, document: other, now: 20 })
    const read = await readRecovery({ storage, ownerId: A, designId: DESIGN })

    expect(recoveryOffer({ read, cloudHeadSeq: 2, cloudDocument: createEmptyCanonicalDocument() })).toMatchObject({
      kind: 'recover',
      key: key(W, 2),
      settled: [],
    })

    // The newest is what the cloud already has: it is settled, and the
    // other tab's older copy is the one offered.
    expect(recoveryOffer({ read, cloudHeadSeq: 2, cloudDocument: other })).toMatchObject({
      kind: 'stale',
      key: key(W2, 1),
      settled: [key(W, 2)],
    })
  })

  test('deleting the answered record leaves the other tab’s copy to be offered', async () => {
    const storage = memoryRecoveryStorage()
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W2, baseSeq: 1, revision: 3, document: edited(), now: 10 })
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W, baseSeq: 1, revision: 5, document: edited(), now: 20 })
    const first = recoveryOffer({
      read: await readRecovery({ storage, ownerId: A, designId: DESIGN }),
      cloudHeadSeq: 1,
      cloudDocument: createEmptyCanonicalDocument(),
    })
    expect(first.kind !== 'none' && first.key).toBe(key(W, 1))

    await deleteRecovery({ storage, keys: [key(W, 1)] })
    const second = recoveryOffer({
      read: await readRecovery({ storage, ownerId: A, designId: DESIGN }),
      cloudHeadSeq: 1,
      cloudDocument: createEmptyCanonicalDocument(),
    })
    expect(second.kind !== 'none' && second.key).toBe(key(W2, 1))

    await deleteRecovery({ storage, keys: [key(W2, 1)] })
    expect(await readRecovery({ storage, ownerId: A, designId: DESIGN })).toEqual({ status: 'none' })
  })

  test('a record from before writers existed is still read and offered', async () => {
    const legacy = `recovery/v1/${A}/${DESIGN}/2/4`
    const storage = memoryRecoveryStorage({
      [legacy]: JSON.stringify({
        ownerId: A,
        designId: DESIGN,
        schemaVersion: 2,
        baseSeq: 4,
        revision: 3,
        savedAt: 1,
        document: edited(),
      }),
    })
    const read = await readRecovery({ storage, ownerId: A, designId: DESIGN })

    expect(recoveryOffer({ read, cloudHeadSeq: 4, cloudDocument: createEmptyCanonicalDocument() })).toMatchObject({
      kind: 'recover',
      key: legacy,
    })
  })
})

describe('recovery offers', () => {
  async function found(baseSeq: number, document: unknown = edited()) {
    const storage = memoryRecoveryStorage()
    await writeRecovery({
      storage,
      ownerId: A,
      designId: DESIGN,
      writerId: W,
      baseSeq,
      revision: 3,
      document: document as CanonicalDocument,
    })
    return readRecovery({ storage, ownerId: A, designId: DESIGN })
  }

  test('same base offers recover', async () => {
    const offer = recoveryOffer({ read: await found(4), cloudHeadSeq: 4, cloudDocument: createEmptyCanonicalDocument() })
    expect(offer.kind).toBe('recover')
  })

  test('a different base is stale: an explicit choice, not an overwrite', async () => {
    const offer = recoveryOffer({ read: await found(3), cloudHeadSeq: 4, cloudDocument: createEmptyCanonicalDocument() })
    expect(offer.kind).toBe('stale')
  })

  test('another schema version is unsupported', async () => {
    const offer = recoveryOffer({
      read: await found(4, { ...edited(), schemaVersion: 3 }),
      cloudHeadSeq: 4,
      cloudDocument: createEmptyCanonicalDocument(),
    })
    expect(offer.kind).toBe('unsupported')
  })

  test('an invalid document is unsupported', async () => {
    const offer = recoveryOffer({
      read: await found(4, { ...edited(), panels: 'nope' }),
      cloudHeadSeq: 4,
      cloudDocument: createEmptyCanonicalDocument(),
    })
    expect(offer.kind).toBe('unsupported')
  })

  test('a copy identical to the cloud needs no question', async () => {
    const offer = recoveryOffer({ read: await found(3), cloudHeadSeq: 4, cloudDocument: edited() })
    expect(offer.kind).toBe('none')
  })

  test('corrupt records are reported, not loaded', async () => {
    const storage = memoryRecoveryStorage({
      [recoveryKey({ ownerId: A, designId: DESIGN, writerId: W, schemaVersion: 2, baseSeq: 1 })]: '{not json',
    })
    const read = await readRecovery({ storage, ownerId: A, designId: DESIGN })

    expect(read.status).toBe('corrupt')
    expect(recoveryOffer({ read, cloudHeadSeq: 1, cloudDocument: edited() }).kind).toBe('none')
  })
})

describe('storage failures', () => {
  test('quota and unavailable storage are named, never reported as kept', async () => {
    const args = { ownerId: A, designId: DESIGN, writerId: W, baseSeq: 1, revision: 2, document: edited() }

    expect(await writeRecovery({ storage: failing('QuotaExceededError'), ...args })).toEqual({ ok: false, reason: 'quota' })
    expect(await writeRecovery({ storage: failing('SecurityError'), ...args })).toEqual({ ok: false, reason: 'unavailable' })
    expect(await readRecovery({ storage: failing('InvalidStateError'), ownerId: A, designId: DESIGN })).toEqual({
      status: 'unavailable',
      reason: 'unavailable',
    })
  })
})

describe('recovery binding', () => {
  const store = () => useEditorStore.getState()

  beforeEach(() => {
    useSessionStore.setState({
      status: 'signed-in',
      account: { userId: A, email: null },
      accessToken: 't',
      accountEpoch: 1,
    })
    store().reset()
    store().loadCanonical({
      document: createEmptyCanonicalDocument(),
      cloud: { designId: DESIGN, headSeq: 1, title: 'Tee' },
    })
  })

  function harness(storage: RecoveryStorage = memoryRecoveryStorage()) {
    let respond: ((result: FlpResult<VersionResponse>) => void) | null = null
    const timers: Array<() => void> = []
    const controller = createSaveController({
      designId: DESIGN,
      headSeq: 1,
      revision: store().revision,
      save: () => new Promise((resolve) => (respond = resolve)),
      setTimer: (callback) => timers.push(callback),
      clearTimer: () => {},
    })
    const stopEditor = useEditorStore.subscribe((state, previous) => {
      if (state.revision !== previous.revision) {
        controller.notify({ revision: state.revision, document: getCanonicalDocument() })
      }
    })
    const locals: string[] = []
    const recovery = startCloudRecovery({
      designId: DESIGN,
      ownerId: A,
      writerId: W,
      storage,
      controller,
      onLocal: (local) => locals.push(local.status === 'failed' ? `failed:${local.reason}` : local.status),
    })

    return {
      storage,
      controller,
      recovery,
      locals,
      stop() {
        recovery.stop()
        stopEditor()
      },
      async acknowledge(seq: number) {
        controller.flush()
        respond?.({
          ok: true,
          data: { designId: DESIGN, seq, kind: 'autosave', contentHash: 'sha256:x', restoredFromSeq: null, createdAt: '' },
        })
        await new Promise((resolve) => setTimeout(resolve, 0))
        await recovery.settled()
      },
    }
  }

  test('every unsaved revision is kept locally on the current cloud base', async () => {
    const h = harness(memoryRecoveryStorage())
    store().applyBaseColor({ color: '#ff0000' })
    await h.recovery.settled()

    const read = await readRecovery({ storage: h.storage, ownerId: A, designId: DESIGN })
    expect(read.status === 'found' && read.record.baseSeq).toBe(1)
    expect(read.status === 'found' && read.record.revision).toBe(store().revision)
    expect(h.locals).toEqual(['kept'])
    h.stop()
  })

  test('an acknowledgement of the latest revision clears the local copy', async () => {
    const h = harness(memoryRecoveryStorage())
    store().applyBaseColor({ color: '#ff0000' })
    await h.recovery.settled()
    await h.acknowledge(2)

    expect(await readRecovery({ storage: h.storage, ownerId: A, designId: DESIGN })).toEqual({ status: 'none' })
    expect(h.locals.at(-1)).toBe('none')
    h.stop()
  })

  test('edits newer than the acknowledged one stay, re-based on the new head', async () => {
    const h = harness(memoryRecoveryStorage())
    store().applyBaseColor({ color: '#ff0000' })
    h.controller.flush()
    store().applyBaseColor({ color: '#00ff00' })
    await h.acknowledge(2)

    const read = await readRecovery({ storage: h.storage, ownerId: A, designId: DESIGN })
    expect(read.status === 'found' && read.record.baseSeq).toBe(2)
    expect(read.status === 'found' && read.record.revision).toBe(store().revision)
    h.stop()
  })

  test('another tab’s unsaved copy survives this tab’s writes and acknowledgement', async () => {
    const storage = memoryRecoveryStorage()
    // Tab B is in conflict with an unsaved copy on the old base.
    const theirs = edited()
    theirs.base = { kind: 'solid', color: '#abcdef' }
    await writeRecovery({ storage, ownerId: A, designId: DESIGN, writerId: W2, baseSeq: 1, revision: 7, document: theirs })
    const otherKey = recoveryKey({ ownerId: A, designId: DESIGN, writerId: W2, schemaVersion: 2, baseSeq: 1 })
    const before = storage.entries.get(otherKey)

    const h = harness(storage)
    store().applyBaseColor({ color: '#ff0000' })
    await h.recovery.settled()
    expect(storage.entries.size).toBe(2)

    await h.acknowledge(2)
    expect([...storage.entries.keys()]).toEqual([otherKey])
    expect(storage.entries.get(otherKey)).toBe(before)

    // Reopening the design (head 2) still offers tab B's copy, as stale.
    const read = await readRecovery({ storage, ownerId: A, designId: DESIGN })
    expect(recoveryOffer({ read, cloudHeadSeq: 2, cloudDocument: getCanonicalDocument() })).toMatchObject({
      kind: 'stale',
      key: otherKey,
    })
    h.stop()
  })

  test('a failed local write is reported and nothing claims it was kept', async () => {
    const h = harness(failing('QuotaExceededError'))
    store().applyBaseColor({ color: '#ff0000' })
    await h.recovery.settled()

    expect(h.locals).toEqual(['failed:quota'])
    expect(h.controller.getState().status).not.toBe('saved')
    h.stop()
  })

  test('after an account switch nothing more is written for the old owner', async () => {
    const storage = memoryRecoveryStorage()
    const h = harness(storage)
    useSessionStore.setState({ account: { userId: B, email: null }, accountEpoch: 2 })
    store().applyBaseColor({ color: '#ff0000' })
    await h.recovery.settled()

    expect(storage.entries.size).toBe(0)
    h.stop()
  })
})

describe('withRecoveryTimeout (#190)', () => {
  test('a read that never answers opens as unavailable after the limit', async () => {
    let fire: (() => void) | null = null
    const result = withRecoveryTimeout({
      read: new Promise(() => {}),
      ms: 4000,
      setTimer: (callback) => {
        fire = callback
      },
    })
    fire!()

    expect(await result).toEqual({ status: 'unavailable', reason: 'unavailable' })
  })

  test('a read that answers in time is passed through', async () => {
    const result = withRecoveryTimeout({
      read: Promise.resolve({ status: 'none' } as const),
      ms: 4000,
      setTimer: () => undefined,
    })

    expect(await result).toEqual({ status: 'none' })
  })
})
