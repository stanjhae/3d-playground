import seedDesigns from '../../data/designs.json' with { type: 'json' }

import type { Design, MaterialOverride } from './design-schema'

export const MAX_THUMBNAIL_CHARS = 180_000
export const MAX_TITLE_CHARS = 80
export const MAX_AUTHOR_CHARS = 40
export const MAX_OVERRIDE_COUNT = 16

let liveDesigns: Design[] | null = null

function cloneDesign({ design }: { design: Design }): Design {
  return {
    id: design.id,
    title: design.title,
    author: design.author,
    votes: design.votes,
    thumbnailDataUrl: design.thumbnailDataUrl,
    overrides: design.overrides.map((override) => ({ ...override })),
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

export function resetDesignsStore() {
  liveDesigns = cloneSeed()
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

  return {
    title: cappedTitle,
    author: cappedAuthor || 'Guest',
    thumbnailDataUrl:
      typeof record.thumbnailDataUrl === 'string' ? record.thumbnailDataUrl : '',
    overrides: record.overrides.slice(0, MAX_OVERRIDE_COUNT).map((override) => ({
      meshName: override.meshName.slice(0, 64),
      ...(typeof override.color === 'string' ? { color: override.color.slice(0, 32) } : {}),
      ...(typeof override.roughness === 'number'
        ? { roughness: override.roughness }
        : {}),
      ...(typeof override.metalness === 'number'
        ? { metalness: override.metalness }
        : {}),
      ...(typeof override.mapId === 'string' ? { mapId: override.mapId.slice(0, 64) } : {}),
    })),
  }
}

export function createStoredDesign({
  draft,
}: {
  draft: Omit<Design, 'id' | 'votes'>
}): Design {
  const design: Design = {
    id: `look-${crypto.randomUUID()}`,
    title: draft.title,
    author: draft.author,
    votes: 0,
    thumbnailDataUrl: capThumbnail({
      thumbnailDataUrl: draft.thumbnailDataUrl,
    }),
    overrides: draft.overrides.map((override) => ({ ...override })),
  }

  getLiveDesigns().push(design)

  return cloneDesign({ design })
}

export function voteStoredDesign({ id }: { id: string }): Design | null {
  const found = getLiveDesigns().find((design) => design.id === id)

  if (!found) {
    return null
  }

  found.votes += 1

  return cloneDesign({ design: found })
}
