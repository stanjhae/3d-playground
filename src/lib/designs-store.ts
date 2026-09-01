import seedDesigns from '../../data/designs.json' with { type: 'json' }

import type { Design, GarmentId, MaterialOverride } from './design-schema.ts'
import { resolveGarmentId } from './design-schema.ts'
import {
  createDesignsPersist,
  type DesignsPersist,
  type PersistLoadResult,
} from './designs-persist.ts'
import { sanitizeThumbnail } from './look-thumbnail.ts'

export { MAX_THUMBNAIL_CHARS, isSafeThumbnail } from './look-thumbnail.ts'

export const MAX_TITLE_CHARS = 80
export const MAX_AUTHOR_CHARS = 40
export const MAX_OVERRIDE_COUNT = 16
export const MAX_LIVE_DESIGNS = 24
export const MAX_BOARD_CHARS = 7_500_000
export const PERSIST_ATTEMPTS = 5

const LOOK_ID_PATTERN = /^[A-Za-z0-9-]+$/
const SEED_IDS = new Set(
  (seedDesigns as Design[]).map((design) => design.id),
)

export class DesignsBoardFullError extends Error {
  constructor() {
    super('The house is full')
    this.name = 'DesignsBoardFullError'
  }
}

export class DesignsPersistError extends Error {
  constructor() {
    super('The board could not be kept')
    this.name = 'DesignsPersistError'
  }
}

let liveDesigns: Design[] | null = null
let persistAdapter: DesignsPersist = createDesignsPersist()
let hydratedFromPersist = false
let persistRevision = 0
let lockTail: Promise<void> = Promise.resolve()

function cloneDesign({ design }: { design: Design }): Design {
  return {
    id: design.id,
    title: design.title,
    author: design.author,
    votes: design.votes,
    thumbnailDataUrl: sanitizeThumbnail({
      thumbnailDataUrl: design.thumbnailDataUrl,
    }),
    overrides: design.overrides.map((override) => ({ ...override })),
    garmentId: resolveGarmentId({ garmentId: design.garmentId }),
  }
}

function cloneSeed(): Design[] {
  return (seedDesigns as Design[]).map((design) => cloneDesign({ design }))
}

function getLiveDesigns(): Design[] {
  if (!liveDesigns) {
    liveDesigns = cloneSeed()
  }

  return liveDesigns
}

export function setDesignsPersist({
  persist,
}: {
  persist: DesignsPersist
}) {
  persistAdapter = persist
}

export function resetDesignsStore({
  persist,
}: {
  persist?: DesignsPersist
} = {}) {
  liveDesigns = cloneSeed()
  hydratedFromPersist = false
  persistRevision = 0
  persistAdapter = persist ?? createDesignsPersist()
  lockTail = Promise.resolve()
}

export async function withDesignsLock<T>({
  run,
}: {
  run: () => Promise<T>
}): Promise<T> {
  let release = () => {}
  const previous = lockTail
  lockTail = new Promise<void>((resolve) => {
    release = () => {
      resolve()
    }
  })
  await previous

  try {
    return await run()
  } finally {
    release()
  }
}

async function readPersist(): Promise<PersistLoadResult> {
  try {
    return await persistAdapter.load()
  } catch {
    return { status: 'error' }
  }
}

function isMaterialOverride(value: unknown): value is MaterialOverride {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return typeof record.meshName === 'string' && record.meshName.length > 0
}

export function normalizeLoadedDesign({
  value,
}: {
  value: unknown
}): Design | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''

  if (!LOOK_ID_PATTERN.test(id)) {
    return null
  }

  const draft = parseDesignDraft({
    body: {
      title: typeof record.title === 'string' ? record.title : '',
      author: typeof record.author === 'string' ? record.author : 'Guest',
      thumbnailDataUrl:
        typeof record.thumbnailDataUrl === 'string'
          ? record.thumbnailDataUrl
          : '',
      overrides: record.overrides,
      garmentId: record.garmentId,
    },
  })

  if (!draft) {
    return null
  }

  const votes =
    typeof record.votes === 'number' && Number.isFinite(record.votes)
      ? Math.max(0, Math.floor(record.votes))
      : 0

  return cloneDesign({
    design: {
      id,
      votes,
      ...draft,
    },
  })
}

export function mergeDesigns({
  local,
  remote,
}: {
  local: Design[]
  remote: Design[]
}) {
  const byId = new Map<string, Design>()

  for (const design of remote) {
    const normalized = normalizeLoadedDesign({ value: design })

    if (normalized) {
      byId.set(normalized.id, normalized)
    }
  }

  for (const design of local) {
    const incoming = cloneDesign({ design })
    const existing = byId.get(incoming.id)

    if (!existing) {
      byId.set(incoming.id, incoming)
      continue
    }

    byId.set(incoming.id, {
      ...existing,
      title: incoming.title || existing.title,
      author: incoming.author || existing.author,
      thumbnailDataUrl:
        incoming.thumbnailDataUrl || existing.thumbnailDataUrl,
      overrides:
        incoming.overrides.length > 0 ? incoming.overrides : existing.overrides,
      garmentId: incoming.garmentId,
      votes: Math.max(existing.votes, incoming.votes),
    })
  }

  return [...byId.values()]
}

export function capBoard({ designs }: { designs: Design[] }) {
  if (designs.length <= MAX_LIVE_DESIGNS) {
    return designs
  }

  const seeds = designs.filter((design) => SEED_IDS.has(design.id))
  const guests = designs
    .filter((design) => !SEED_IDS.has(design.id))
    .sort((left, right) => {
      if (right.votes !== left.votes) {
        return right.votes - left.votes
      }

      return left.id.localeCompare(right.id)
    })
  const room = Math.max(0, MAX_LIVE_DESIGNS - seeds.length)

  return [...seeds, ...guests.slice(0, room)]
}

function boardSatisfied({
  expected,
  actual,
}: {
  expected: Design[]
  actual: Design[]
}) {
  return expected.every((design) => {
    const found = actual.find((item) => item.id === design.id)

    return Boolean(found && found.votes >= design.votes)
  })
}

export async function hydrateDesignsStore() {
  if (hydratedFromPersist && liveDesigns) {
    return
  }

  const loaded = await readPersist()

  if (loaded.status === 'ok') {
    const designs = loaded.designs
      .map((value) => normalizeLoadedDesign({ value }))
      .filter((design): design is Design => design !== null)

    liveDesigns = capBoard({
      designs: mergeDesigns({
        local: cloneSeed(),
        remote: designs,
      }),
    })
    persistRevision = loaded.revision
    hydratedFromPersist = true
    return
  }

  if (loaded.status === 'error') {
    if (!liveDesigns) {
      liveDesigns = cloneSeed()
    }

    hydratedFromPersist = true
    return
  }

  if (!liveDesigns) {
    liveDesigns = cloneSeed()
  }

  hydratedFromPersist = true

  try {
    await persistAdapter.save({ designs: liveDesigns, revision: 1 })
    persistRevision = 1
  } catch {
    persistRevision = 0
  }
}

export function boardPayloadChars({
  designs,
}: {
  designs: Design[]
}) {
  return JSON.stringify(designs).length
}

export async function persistDesignsStore() {
  if (!liveDesigns) {
    return
  }

  let local = capBoard({
    designs: mergeDesigns({
      local: cloneSeed(),
      remote: liveDesigns.map((design) => cloneDesign({ design })),
    }),
  })

  for (let attempt = 0; attempt < PERSIST_ATTEMPTS; attempt += 1) {
    const loaded = await readPersist()

    if (loaded.status === 'error') {
      throw new DesignsPersistError()
    }

    const remote = loaded.status === 'ok' ? loaded.designs : []
    const remoteRevision = loaded.status === 'ok' ? loaded.revision : persistRevision
    const merged = capBoard({
      designs: mergeDesigns({ local, remote }),
    })

    if (boardPayloadChars({ designs: merged }) > MAX_BOARD_CHARS) {
      throw new DesignsPersistError()
    }

    const nextRevision = remoteRevision + 1

    try {
      await persistAdapter.save({ designs: merged, revision: nextRevision })
    } catch {
      throw new DesignsPersistError()
    }

    const check = await readPersist()

    if (check.status === 'error') {
      throw new DesignsPersistError()
    }

    const actual = check.status === 'ok' ? check.designs : []

    if (boardSatisfied({ expected: merged, actual })) {
      liveDesigns = actual
        .map((value) => normalizeLoadedDesign({ value }))
        .filter((design): design is Design => design !== null)
      persistRevision = check.status === 'ok' ? check.revision : nextRevision
      return
    }

    local = mergeDesigns({ local: merged, remote: actual })
  }

  throw new DesignsPersistError()
}

export function listStoredDesigns(): Design[] {
  return getLiveDesigns().map((design) => cloneDesign({ design }))
}

export function getStoredDesign({ id }: { id: string }): Design | null {
  const found = getLiveDesigns().find((design) => design.id === id)

  return found ? cloneDesign({ design: found }) : null
}

export function capThumbnail({
  thumbnailDataUrl,
}: {
  thumbnailDataUrl: string
}) {
  return sanitizeThumbnail({ thumbnailDataUrl })
}

export function parseDesignDraft({
  body,
}: {
  body: unknown
}): Omit<Design, 'id' | 'votes'> | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const record = body as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const author = typeof record.author === 'string' ? record.author.trim() : ''

  if (!title || !Array.isArray(record.overrides)) {
    return null
  }

  if (!record.overrides.every(isMaterialOverride)) {
    return null
  }

  const cappedTitle = title.slice(0, MAX_TITLE_CHARS)
  const cappedAuthor = (author || 'Guest').slice(0, MAX_AUTHOR_CHARS)
  const garmentId: GarmentId = resolveGarmentId({
    garmentId: typeof record.garmentId === 'string' ? record.garmentId : undefined,
  })

  return {
    title: cappedTitle,
    author: cappedAuthor || 'Guest',
    thumbnailDataUrl: capThumbnail({
      thumbnailDataUrl:
        typeof record.thumbnailDataUrl === 'string'
          ? record.thumbnailDataUrl
          : '',
    }),
    overrides: record.overrides.slice(0, MAX_OVERRIDE_COUNT).map((override) => ({
      meshName: override.meshName.slice(0, 64),
      ...(typeof override.color === 'string'
        ? { color: override.color.slice(0, 32) }
        : {}),
      ...(typeof override.roughness === 'number'
        ? { roughness: override.roughness }
        : {}),
      ...(typeof override.metalness === 'number'
        ? { metalness: override.metalness }
        : {}),
      ...(typeof override.mapId === 'string'
        ? { mapId: override.mapId.slice(0, 64) }
        : {}),
    })),
    garmentId,
  }
}

export function createStoredDesign({
  draft,
}: {
  draft: Omit<Design, 'id' | 'votes'>
}): Design {
  if (getLiveDesigns().length >= MAX_LIVE_DESIGNS) {
    throw new DesignsBoardFullError()
  }

  const design: Design = {
    id: `look-${crypto.randomUUID()}`,
    title: draft.title,
    author: draft.author,
    votes: 0,
    thumbnailDataUrl: capThumbnail({
      thumbnailDataUrl: draft.thumbnailDataUrl,
    }),
    overrides: draft.overrides.map((override) => ({ ...override })),
    garmentId: resolveGarmentId({ garmentId: draft.garmentId }),
  }

  getLiveDesigns().push(design)

  return cloneDesign({ design })
}

export function removeStoredDesign({ id }: { id: string }) {
  if (!liveDesigns) {
    return
  }

  liveDesigns = liveDesigns.filter((design) => design.id !== id)
}

export function voteStoredDesign({ id }: { id: string }): Design | null {
  const found = getLiveDesigns().find((design) => design.id === id)

  if (!found) {
    return null
  }

  found.votes += 1

  return cloneDesign({ design: found })
}

export function restoreStoredVotes({
  id,
  votes,
}: {
  id: string
  votes: number
}) {
  const found = getLiveDesigns().find((design) => design.id === id)

  if (!found) {
    return
  }

  found.votes = votes
}
