import { frameStill } from './capture-still'
import type { Design } from './design-schema'
import { MAX_THUMBNAIL_CHARS } from './designs-store'
import { HOUSE_COPY } from './house-copy'

async function readErrorMessage({
  response,
  fallback,
}: {
  response: Response
  fallback: string
}) {
  try {
    const body = (await response.json()) as { error?: unknown }

    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error
    }
  } catch {
    // House copy still names the failure.
  }

  return fallback
}

export function voteRequestPath({ id }: { id: string }) {
  return `/api/designs/${encodeURIComponent(id)}/vote`
}

export async function listDesigns(): Promise<Design[]> {
  const response = await fetch('/api/designs')

  if (!response.ok) {
    throw new Error('The board could not load')
  }

  const body = (await response.json()) as { designs?: Design[] }

  return body.designs ?? []
}

export async function getDesign({
  id,
}: {
  id: string
}): Promise<Design | null> {
  const designs = await listDesigns()

  return designs.find((design) => design.id === id) ?? null
}

export async function shrinkThumbnail({
  dataUrl,
}: {
  dataUrl: string
}): Promise<string> {
  if (!dataUrl || dataUrl.length <= MAX_THUMBNAIL_CHARS) {
    return dataUrl
  }

  if (typeof document === 'undefined') {
    return ''
  }

  return frameStill({ dataUrl })
}

export async function createDesign({
  design,
}: {
  design: Omit<Design, 'id' | 'votes'>
}): Promise<Design> {
  const thumbnailDataUrl = await shrinkThumbnail({
    dataUrl: design.thumbnailDataUrl,
  })
  const response = await fetch('/api/designs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...design,
      thumbnailDataUrl,
    }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage({
        response,
        fallback: HOUSE_COPY.publishFailed,
      }),
    )
  }

  const body = (await response.json()) as { design: Design }

  return body.design
}

export async function voteOnDesign({
  id,
}: {
  id: string
}): Promise<{ id: string; votes: number }> {
  const response = await fetch(voteRequestPath({ id }), {
    method: 'POST',
  })

  if (response.status === 404) {
    throw new Error('That look is gone')
  }

  if (!response.ok) {
    throw new Error(
      await readErrorMessage({
        response,
        fallback: HOUSE_COPY.voteFailed,
      }),
    )
  }

  return (await response.json()) as { id: string; votes: number }
}
