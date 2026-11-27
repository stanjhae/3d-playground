import {
  cloneDocument,
  parseDocument,
  type DesignDocument,
} from './design-document'
import type { GarmentId } from './design-schema'
import { resolveGarmentId } from './design-schema'

export const DRAFT_STORAGE_KEY = 'flv:draft:current'
const DRAFT_DB_NAME = 'flv-atelier'
const DRAFT_STORE_NAME = 'kv'

export type EditorDraft = {
  garmentId: GarmentId
  document: DesignDocument
}

export function serializeDraft({
  garmentId,
  document,
}: {
  garmentId: GarmentId
  document: DesignDocument
}) {
  return JSON.stringify({
    garmentId: resolveGarmentId({ garmentId }),
    document: cloneDocument({ document }),
  })
}

export function parseDraft({ value }: { value: unknown }): EditorDraft | null {
  if (!value) {
    return null
  }

  let record: unknown = value

  if (typeof value === 'string') {
    try {
      record = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!record || typeof record !== 'object') {
    return null
  }

  const body = record as Record<string, unknown>
  const document = parseDocument({ value: body.document ?? body })

  if (!document) {
    return null
  }

  return {
    garmentId: resolveGarmentId({
      garmentId: typeof body.garmentId === 'string' ? body.garmentId : document.garmentId,
    }),
    document,
  }
}

function memoryStore() {
  const root = globalThis as {
    localStorage?: Storage
  }

  return root.localStorage ?? null
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no idb'))
      return
    }

    const request = indexedDB.open(DRAFT_DB_NAME, 1)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        request.result.createObjectStore(DRAFT_STORE_NAME)
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('no idb'))
    }
  })
}

async function idbWrite({ payload }: { payload: string }) {
  const db = await openDraftDb()

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite')
      tx.oncomplete = () => {
        resolve()
      }
      tx.onerror = () => {
        reject(tx.error ?? new Error('draft write'))
      }
      tx.objectStore(DRAFT_STORE_NAME).put(payload, DRAFT_STORAGE_KEY)
    })
  } finally {
    db.close()
  }
}

async function idbRead() {
  const db = await openDraftDb()

  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, 'readonly')
      const request = tx.objectStore(DRAFT_STORE_NAME).get(DRAFT_STORAGE_KEY)
      request.onsuccess = () => {
        resolve(typeof request.result === 'string' ? request.result : null)
      }
      request.onerror = () => {
        reject(request.error ?? new Error('draft read'))
      }
    })
  } finally {
    db.close()
  }
}

async function idbClear() {
  const db = await openDraftDb()

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite')
      tx.oncomplete = () => {
        resolve()
      }
      tx.onerror = () => {
        reject(tx.error ?? new Error('draft clear'))
      }
      tx.objectStore(DRAFT_STORE_NAME).delete(DRAFT_STORAGE_KEY)
    })
  } finally {
    db.close()
  }
}

export async function saveDraft({
  garmentId,
  document,
}: {
  garmentId: GarmentId
  document: DesignDocument
}) {
  const payload = serializeDraft({ garmentId, document })

  try {
    await idbWrite({ payload })
    return payload
  } catch {
    try {
      memoryStore()?.setItem(DRAFT_STORAGE_KEY, payload)
      return payload
    } catch {
      return null
    }
  }
}

export async function loadDraft(): Promise<EditorDraft | null> {
  try {
    const stored = await idbRead()
    const fromIdb = parseDraft({ value: stored })

    if (fromIdb) {
      return fromIdb
    }
  } catch {
    // Fall through to local storage.
  }

  return parseDraft({ value: memoryStore()?.getItem(DRAFT_STORAGE_KEY) })
}

export async function clearDraft() {
  try {
    await idbClear()
  } catch {
    // local storage may still hold a copy
  }

  try {
    memoryStore()?.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    return
  }
}
