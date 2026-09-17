import { useEffect, useState } from 'react'

import type { DesignDocument } from './design-document'
import { isSafeLayerSrc } from './look-thumbnail'
import type { AtlasBuffer } from './paint-atlas'

export function listLayerSrcs({
  document,
}: {
  document: DesignDocument
}) {
  return document.layers
    .filter(
      (layer): layer is Extract<DesignDocument['layers'][number], { src: string }> =>
        (layer.kind === 'art' || layer.kind === 'graphic') &&
        layer.visible &&
        Boolean(layer.src),
    )
    .map((layer) => layer.src)
}

export async function decodeLayerImage({
  src,
}: {
  src: string
}): Promise<AtlasBuffer | null> {
  if (!isSafeLayerSrc({ src }) || typeof document === 'undefined') {
    return null
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const width = Math.max(1, Math.min(1024, image.width))
      const height = Math.max(1, Math.min(1024, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')

      if (!context) {
        resolve(null)
        return
      }

      context.drawImage(image, 0, 0, width, height)
      const pixels = context.getImageData(0, 0, width, height)
      resolve({
        width,
        height,
        pixels: new Uint8ClampedArray(pixels.data),
      })
    }
    image.onerror = () => {
      resolve(null)
    }
    image.src = src
  })
}

export async function decodeDocumentImages({
  document,
}: {
  document: DesignDocument
}) {
  const images: Record<string, AtlasBuffer> = {}

  for (const src of listLayerSrcs({ document })) {
    if (images[src]) {
      continue
    }

    const decoded = await decodeLayerImage({ src })

    if (decoded) {
      images[src] = decoded
    }
  }

  return images
}

export function useLayerImages({
  document,
}: {
  document: DesignDocument
}) {
  const [images, setImages] = useState<Record<string, AtlasBuffer>>({})
  const srcKey = listLayerSrcs({ document }).join('|')

  useEffect(() => {
    let cancelled = false
    const srcs = srcKey ? srcKey.split('|') : []

    if (srcs.length === 0) {
      setImages({})
      return
    }

    void Promise.all(
      srcs.map(async (src) => {
        const decoded = await decodeLayerImage({ src })
        return [src, decoded] as const
      }),
    ).then((entries) => {
      if (cancelled) {
        return
      }

      const next: Record<string, AtlasBuffer> = {}

      for (const [src, decoded] of entries) {
        if (decoded) {
          next[src] = decoded
        }
      }

      setImages(next)
    })

    return () => {
      cancelled = true
    }
  }, [srcKey])

  return images
}
