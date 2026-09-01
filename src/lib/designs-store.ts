import seedDesigns from '../../data/designs.json' with { type: 'json' }

import type { Design, GarmentId, MaterialOverride } from './design-schema.ts'
import { resolveGarmentId } from './design-schema.ts'
import {
  createDesignsPersist,
  type DesignsPersist,
} from './designs-persist.ts'

export const MAX_THUMBNAIL_CHARS = 180_000
export const MAX_TITLE_CHARS = 80
export const MAX_AUTHOR_CHARS = 40
export const MAX_OVERRIDE_COUNT = 16
export const MAX_LIVE_DESIGNS = 24
export const MAX_BOARD_CHARS = 7_500_000

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
let lockTail: Promise<void> = Promise.resolve()

function cloneDesign({ design }: { design: Design }): Design {
  return {
    id: design.id,
    title: design.title,
    author: design.author,
    votes: design.votes,
    thumbnailDataUrl: design.thumbnailDataUrl,
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

export async function hydrateDesignsStore() {
  if (hydratedFromPersist && liveDesigns) {
    return
  }

  try {
    const loaded = await persistAdapter.load()

    if (loaded && loaded.length > 0) {
      liveDesigns = loaded.map((design) => cloneDesign({ design }))
      hydratedFromPersist = true
      return
    }
  } catch {
    // Seed still serves if the board cannot be read.
  }

  if (!liveDesigns) {
    liveDesigns = cloneSeed()
  }

  hydratedFromPersist = true

  try {
    await persistAdapter.save({ designs: liveDesigns })
  } catch {
    // Local seed still serves.
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

  const designs = liveDesigns.map((design) => cloneDesign({ design }))

  if (boardPayloadChars({ designs }) > MAX_BOARD_CHARS) {
    throw new DesignsPersistError()
  }

  try {
    await persistAdapter.save({ designs })
  } catch {
    throw new DesignsPersistError()
  }
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
  if (thumbnailDataUrl.length <= MAX_THUMBNAIL_CHARS) {
    return thumbnailDataUrl
  }

  return ''
}

function isMaterialOverride(value: unknown): value is MaterialOverride {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return typeof record.meshName === 'string' && record.meshName.length > 0
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
