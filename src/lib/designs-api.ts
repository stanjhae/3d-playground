import type { Design } from './design-schema'
import { MAX_THUMBNAIL_CHARS } from './designs-store'

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

  return new Promise((resolve) => {
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      const width = 480
      const height =
        image.width > 0
          ? Math.max(1, Math.round((image.height / image.width) * width))
          : 600

      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d')

      if (!context) {
        resolve('')
        return
      }

      context.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }

    image.onerror = () => {
      resolve('')
    }

    image.src = dataUrl
  })
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
    throw new Error('The look could not be published')
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
    throw new Error('The vote could not be counted')
  }

  return (await response.json()) as { id: string; votes: number }
}
