import {
  type CanonicalDocument,
  CANONICAL_SCHEMA_VERSION,
  validateCanonicalDocument,
} from './canonical-document.ts'
import { serializeCanonicalDocument } from './canonical-hash.ts'

/**
 * Owner-scoped local recovery for signed-in cloud designs (S05 #174).
 *
 * While a revision is not yet acknowledged by the cloud, the canonical
 * document is kept in IndexedDB under
 * `recovery/v1/<owner>/<design>/<schemaVersion>/<baseSeq>`; it is cleared
 * once the cloud acknowledges that revision. Records hold the document and
 * its cloud base only (never tokens or emails), and are looked up by owner,
 * so another account never lists or loads them. They are not deleted on
 * sign-out, so the same owner can recover after a session expires.
 *
 * Storage is injected so failures (unavailable, quota, corrupt) are
 * testable; the IndexedDB adapter is the browser default.
 */

export type RecoveryStorage = {
  get: (key: string) => Promise<unknown>
  put: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
  keys: (prefix: string) => Promise<string[]>
}

export type RecoveryRecord = {
  ownerId: string
  designId: string
  schemaVersion: number
  baseSeq: number
  /** Studio revision when written; only meaningful within one session. */
  revision: number
  savedAt: number
  /** Canonical document as written; validated again on read. */
  document: unknown
}

export type StorageFailure = 'unavailable' | 'quota' | 'failed'

export type RecoveryWriteResult = { ok: true } | { ok: false; reason: StorageFailure }

export type RecoveryRead =
  | { status: 'none' }
  | { status: 'found'; key: string; record: RecoveryRecord }
  | { status: 'corrupt'; keys: string[] }
  | { status: 'unavailable'; reason: StorageFailure }

/** What opening a cloud design should offer, given what was found locally. */
export type RecoveryOffer =
  | { kind: 'none' }
  /** Same owner, design and base: the local edits apply cleanly. */
  | { kind: 'recover'; record: RecoveryRecord; document: CanonicalDocument }
  /** The cloud moved on since these edits; never overwrite it silently. */
  | { kind: 'stale'; record: RecoveryRecord; document: CanonicalDocument }
  /** Written by another schema version, or no longer valid. */
  | { kind: 'unsupported'; record: RecoveryRecord }

const ROOT = 'recovery/v1'

function part(value: string) {
  return encodeURIComponent(value)
}

export function recoveryPrefix({ ownerId, designId }: { ownerId: string; designId?: string }) {
  return designId ? `${ROOT}/${part(ownerId)}/${part(designId)}/` : `${ROOT}/${part(ownerId)}/`
}

export function recoveryKey({
  ownerId,
  designId,
  schemaVersion,
  baseSeq,
}: {
  ownerId: string
  designId: string
  schemaVersion: number
  baseSeq: number
}) {
  return `${recoveryPrefix({ ownerId, designId })}${schemaVersion}/${baseSeq}`
}

export function storageFailure({ error }: { error: unknown }): StorageFailure {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''

  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'quota'
  }

  if (name === 'RecoveryUnavailable' || name === 'InvalidStateError' || name === 'SecurityError') {
    return 'unavailable'
  }

  return 'failed'
}

export async function writeRecovery({
  storage,
  ownerId,
  designId,
  baseSeq,
  revision,
  document,
  now = Date.now(),
}: {
  storage: RecoveryStorage
  ownerId: string
  designId: string
  baseSeq: number
  revision: number
  document: CanonicalDocument
  now?: number
}): Promise<RecoveryWriteResult> {
  const record: RecoveryRecord = {
    ownerId,
    designId,
    schemaVersion: document.schemaVersion,
    baseSeq,
    revision,
    savedAt: now,
    document,
  }
  const key = recoveryKey({ ownerId, designId, schemaVersion: document.schemaVersion, baseSeq })

  try {
    await storage.put(key, JSON.stringify(record))

    // One record per design: drop older bases once the new one is down.
    for (const other of await storage.keys(recoveryPrefix({ ownerId, designId }))) {
      if (other !== key) {
        await storage.delete(other)
      }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, reason: storageFailure({ error }) }
  }
}

export async function clearRecovery({
  storage,
  ownerId,
  designId,
}: {
  storage: RecoveryStorage
  ownerId: string
  designId: string
}): Promise<RecoveryWriteResult> {
  try {
    for (const key of await storage.keys(recoveryPrefix({ ownerId, designId }))) {
      await storage.delete(key)
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, reason: storageFailure({ error }) }
  }
}

function parseRecord({
  value,
  ownerId,
  designId,
}: {
  value: unknown
  ownerId: string
  designId: string
}): RecoveryRecord | null {
  if (typeof value !== 'string') {
    return null
  }

  let body: unknown

  try {
    body = JSON.parse(value)
  } catch {
    return null
  }

  if (!body || typeof body !== 'object') {
    return null
  }

  const record = body as Partial<RecoveryRecord>

  // The owner and design inside must match the key we looked under.
  if (
    record.ownerId !== ownerId ||
    record.designId !== designId ||
    typeof record.schemaVersion !== 'number' ||
    typeof record.baseSeq !== 'number' ||
    typeof record.revision !== 'number' ||
    typeof record.savedAt !== 'number' ||
    !('document' in record)
  ) {
    return null
  }

  return record as RecoveryRecord
}

export async function readRecovery({
  storage,
  ownerId,
  designId,
}: {
  storage: RecoveryStorage
  ownerId: string
  designId: string
}): Promise<RecoveryRead> {
  try {
    const keys = await storage.keys(recoveryPrefix({ ownerId, designId }))
    let found: { key: string; record: RecoveryRecord } | null = null
    const corrupt: string[] = []

    for (const key of keys) {
      const record = parseRecord({ value: await storage.get(key), ownerId, designId })

      if (!record) {
        corrupt.push(key)
      } else if (!found || record.savedAt > found.record.savedAt) {
        found = { key, record }
      }
    }

    if (found) {
      return { status: 'found', ...found }
    }

    return corrupt.length > 0 ? { status: 'corrupt', keys: corrupt } : { status: 'none' }
  } catch (error) {
    return { status: 'unavailable', reason: storageFailure({ error }) }
  }
}

/**
 * Decide what to offer when a cloud design opens. Local work that matches
 * the cloud exactly is not worth a prompt; anything else needs a choice.
 */
export function recoveryOffer({
  read,
  cloudHeadSeq,
  cloudDocument,
}: {
  read: RecoveryRead
  cloudHeadSeq: number
  cloudDocument: CanonicalDocument
}): RecoveryOffer {
  if (read.status !== 'found') {
    return { kind: 'none' }
  }

  const { record } = read

  if (record.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    return { kind: 'unsupported', record }
  }

  const checked = validateCanonicalDocument({ value: record.document })

  if (!checked.ok) {
    return { kind: 'unsupported', record }
  }

  if (
    serializeCanonicalDocument({ document: checked.document }) ===
    serializeCanonicalDocument({ document: cloudDocument })
  ) {
    return { kind: 'none' }
  }

  return {
    kind: record.baseSeq === cloudHeadSeq ? 'recover' : 'stale',
    record,
    document: checked.document,
  }
}

/**
 * The offer as of now, not as of load. If the cloud head moved past the
 * local copy's base, or there are edits not yet saved, applying the local
 * copy would overwrite newer work: it becomes `stale`, which only offers
 * "open cloud version" or "save mine as a copy".
 */
export function liveRecoveryOffer({
  offer,
  cloudHeadSeq,
  hasUnsavedEdits,
}: {
  offer: Exclude<RecoveryOffer, { kind: 'none' }>
  cloudHeadSeq: number
  hasUnsavedEdits: boolean
}): Exclude<RecoveryOffer, { kind: 'none' }> {
  if (offer.kind !== 'recover') {
    return offer
  }

  return offer.record.baseSeq !== cloudHeadSeq || hasUnsavedEdits
    ? { kind: 'stale', record: offer.record, document: offer.document }
    : offer
}

export const RECOVERY_WARNINGS: Record<StorageFailure | 'corrupt', string> = {
  unavailable: 'This browser is not keeping a local copy. Unsaved changes are only in this tab.',
  quota: 'This device is out of space for a local copy. Unsaved changes are only in this tab.',
  failed: 'A local copy could not be kept. Unsaved changes are only in this tab.',
  corrupt: 'A local copy of this design was damaged and could not be read.',
}

class RecoveryUnavailable extends Error {
  override name = 'RecoveryUnavailable'
}

const DB_NAME = 'flv-recovery'
const STORE_NAME = 'records'

function request<T>(run: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) {
  return new Promise<T>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new RecoveryUnavailable('no indexedDB'))
      return
    }

    const open = indexedDB.open(DB_NAME, 1)

    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE_NAME)) {
        open.result.createObjectStore(STORE_NAME)
      }
    }
    open.onerror = () => {
      reject(new RecoveryUnavailable(open.error?.message ?? 'indexedDB blocked'))
    }
    open.onsuccess = () => {
      const db = open.result
      let result: T

      try {
        const tx = db.transaction(STORE_NAME, mode)
        const pending = run(tx.objectStore(STORE_NAME))
        pending.onsuccess = () => {
          result = pending.result
        }
        tx.oncomplete = () => {
          db.close()
          resolve(result)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('recovery storage'))
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error ?? new Error('recovery storage'))
        }
      } catch (error) {
        db.close()
        reject(error)
      }
    }
  })
}

/** The browser's IndexedDB, one object store of JSON strings. */
export const indexedDbRecoveryStorage: RecoveryStorage = {
  get: (key) => request((store) => store.get(key), 'readonly'),
  put: async (key, value) => {
    await request((store) => store.put(value, key), 'readwrite')
  },
  delete: async (key) => {
    await request((store) => store.delete(key), 'readwrite')
  },
  keys: async (prefix) => {
    // '￿' sorts after every key that starts with the prefix.
    const keys = await request(
      (store) => store.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)),
      'readonly',
    )
    return keys.filter((key): key is string => typeof key === 'string')
  },
}

/** In-memory storage for tests and as a stand-in shape for adapters. */
export function memoryRecoveryStorage(seed: Record<string, string> = {}): RecoveryStorage & {
  entries: Map<string, string>
} {
  const entries = new Map(Object.entries(seed))

  return {
    entries,
    get: async (key) => entries.get(key),
    put: async (key, value) => {
      entries.set(key, value)
    },
    delete: async (key) => {
      entries.delete(key)
    },
    keys: async (prefix) => [...entries.keys()].filter((key) => key.startsWith(prefix)).sort(),
  }
}
