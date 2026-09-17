import {
  cloneDocument,
  parseDocument,
  type DesignDocument,
} from './design-document'
import { createObjectId } from './design-document'

export const SNAPSHOT_STORAGE_KEY = 'flv:draft:mornings'

export type DesignSnapshot = {
  id: string
  title: string
  createdAt: string
  document: DesignDocument
}

export function createSnapshot({
  title,
  document,
}: {
  title: string
  document: DesignDocument
}): DesignSnapshot {
  const trimmed = title.trim() || 'Morning'

  return {
    id: createObjectId({ prefix: 'morning' }),
    title: trimmed.slice(0, 40),
    createdAt: new Date().toISOString(),
    document: cloneDocument({ document }),
  }
}

export function parseSnapshots({ value }: { value: unknown }): DesignSnapshot[] {
  let record: unknown = value

  if (typeof value === 'string') {
    try {
      record = JSON.parse(value)
    } catch {
      return []
    }
  }

  if (!Array.isArray(record)) {
    return []
  }

  return record
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const body = entry as Record<string, unknown>
      const document = parseDocument({ value: body.document })
      const id = typeof body.id === 'string' ? body.id : ''
      const title = typeof body.title === 'string' ? body.title : ''

      if (!document || !id || !title) {
        return null
      }

      return {
        id,
        title,
        createdAt:
          typeof body.createdAt === 'string'
            ? body.createdAt
            : new Date().toISOString(),
        document,
      }
    })
    .filter((entry): entry is DesignSnapshot => entry !== null)
}

function memoryStore() {
  return (globalThis as { localStorage?: Storage }).localStorage ?? null
}

export function listSnapshots(): DesignSnapshot[] {
  return parseSnapshots({
    value: memoryStore()?.getItem(SNAPSHOT_STORAGE_KEY),
  })
}

export function writeSnapshots({
  snapshots,
}: {
  snapshots: DesignSnapshot[]
}) {
  memoryStore()?.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots.slice(0, 8)))
}

export function rememberSnapshot({
  title,
  document,
}: {
  title: string
  document: DesignDocument
}) {
  const snapshot = createSnapshot({ title, document })
  writeSnapshots({ snapshots: [snapshot, ...listSnapshots()] })
  return snapshot
}

export function restoreSnapshot({ id }: { id: string }) {
  return listSnapshots().find((snapshot) => snapshot.id === id) ?? null
}
