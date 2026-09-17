import {
  cloneDocument,
  parseDocument,
  type DesignDocument,
} from './design-document'
import { createObjectId } from './design-document'
import { isSafeThumbnail } from './look-thumbnail'

export const SNAPSHOT_STORAGE_KEY = 'flv:draft:mornings'
export const MAX_SNAPSHOTS = 8
export const MAX_MORNINGS = 4
export const MAX_ENTERED = 4

export type SnapshotKind = 'morning' | 'entered'

export type DesignSnapshot = {
  id: string
  title: string
  createdAt: string
  document: DesignDocument
  kind: SnapshotKind
  still?: string
}

function sanitizeStill({ still }: { still?: string }) {
  if (!still || !isSafeThumbnail({ thumbnailDataUrl: still })) {
    return undefined
  }

  return still
}

export function createSnapshot({
  title,
  document,
  kind = 'morning',
  still,
  id,
}: {
  title: string
  document: DesignDocument
  kind?: SnapshotKind
  still?: string
  id?: string
}): DesignSnapshot {
  const trimmed = title.trim() || (kind === 'entered' ? 'Look' : 'Morning')
  const safeStill = sanitizeStill({ still })

  return {
    id: id ?? createObjectId({ prefix: kind }),
    title: trimmed.slice(0, 40),
    createdAt: new Date().toISOString(),
    document: cloneDocument({ document }),
    kind,
    ...(safeStill ? { still: safeStill } : {}),
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

      const kind = body.kind === 'entered' ? 'entered' : 'morning'
      const still = sanitizeStill({
        still: typeof body.still === 'string' ? body.still : undefined,
      })

      return {
        id,
        title,
        createdAt:
          typeof body.createdAt === 'string'
            ? body.createdAt
            : new Date().toISOString(),
        document,
        kind,
        ...(still ? { still } : {}),
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

function snapshotsWithoutStill({
  snapshots,
}: {
  snapshots: DesignSnapshot[]
}): DesignSnapshot[] {
  return snapshots.map((entry) => {
    if (!entry.still || entry.still.startsWith('/stills/')) {
      return entry
    }

    const { still: _still, ...rest } = entry
    return rest
  })
}

function tryWrite({
  store,
  snapshots,
}: {
  store: Storage
  snapshots: DesignSnapshot[]
}) {
  store.setItem(
    SNAPSHOT_STORAGE_KEY,
    JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)),
  )
}

export function mergeSnapshots({
  next,
  existing,
}: {
  next: DesignSnapshot
  existing: DesignSnapshot[]
}): DesignSnapshot[] {
  const without = existing.filter((entry) => entry.id !== next.id)
  const mornings = without.filter((entry) => entry.kind === 'morning')
  const entered = without.filter((entry) => entry.kind === 'entered')

  if (next.kind === 'morning') {
    return [
      next,
      ...mornings.slice(0, MAX_MORNINGS - 1),
      ...entered.slice(0, MAX_ENTERED),
    ]
  }

  return [
    ...mornings.slice(0, MAX_MORNINGS),
    next,
    ...entered.slice(0, MAX_ENTERED - 1),
  ]
}

export function writeSnapshots({
  snapshots,
}: {
  snapshots: DesignSnapshot[]
}) {
  const store = memoryStore()

  if (!store) {
    return
  }

  const capped = snapshots.slice(0, MAX_SNAPSHOTS)

  try {
    tryWrite({ store, snapshots: capped })
    return
  } catch {
    // The stills from a guest publish can fill the house. Keep the documents.
  }

  const slim = snapshotsWithoutStill({ snapshots: capped })

  try {
    tryWrite({ store, snapshots: slim })
    return
  } catch {
    // Keep mornings before we empty the shelf.
  }

  const mornings = slim
    .filter((entry) => entry.kind === 'morning')
    .slice(0, MAX_MORNINGS)

  try {
    tryWrite({ store, snapshots: mornings })
  } catch {
    try {
      store.setItem(SNAPSHOT_STORAGE_KEY, '[]')
    } catch {
      return
    }
  }
}

export function rememberSnapshot({
  title,
  document,
  kind = 'morning',
  still,
  lookId,
  existing,
}: {
  title: string
  document: DesignDocument
  kind?: SnapshotKind
  still?: string
  lookId?: string
  existing?: DesignSnapshot[]
}) {
  const id = lookId ? `entered-${lookId}` : undefined
  const snapshot = createSnapshot({
    title,
    document,
    kind,
    still,
    id,
  })
  const snapshots = mergeSnapshots({
    next: snapshot,
    existing: existing ?? listSnapshots(),
  })
  writeSnapshots({ snapshots })
  return { snapshot, snapshots }
}

export function restoreSnapshot({ id }: { id: string }) {
  return listSnapshots().find((snapshot) => snapshot.id === id) ?? null
}
