import { useEffect, useState } from 'react'

import type { DesignDocument } from './design-document'
import { isObjectUrlSrc, isSafeLayerSrc } from './look-thumbnail'
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

/** Raster images are decoded at their own size, up to this on each side. */
export const RASTER_MAX_EDGE = 1024

/**
 * Vector graphics are drawn at the cloth's resolution instead: the long
 * edge matches the tee v4 atlas (2048), so marks stay crisp when scaled up.
 */
export const SVG_RASTER_LONG_EDGE = 2048

export function isSvgSrc({ src }: { src: string }) {
  if (src.startsWith('data:')) {
    return /^data:image\/svg\+xml[;,]/i.test(src)
  }

  return /\.svg$/i.test(src.split(/[?#]/)[0] ?? '')
}

/**
 * The size a layer image is decoded at. SVGs are scaled so their long edge
 * is `longEdge`, keeping their aspect; an SVG with no intrinsic size is
 * treated as square. Other images keep their natural size, capped.
 */
export function layerRasterSize({
  width,
  height,
  svg,
  longEdge = SVG_RASTER_LONG_EDGE,
}: {
  width: number
  height: number
  svg: boolean
  longEdge?: number
}) {
  if (svg) {
    const w = width > 0 ? width : 1
    const h = height > 0 ? height : w
    const scale = longEdge / Math.max(w, h)
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
    }
  }

  return {
    width: Math.max(1, Math.min(RASTER_MAX_EDGE, width)),
    height: Math.max(1, Math.min(RASTER_MAX_EDGE, height)),
  }
}

export async function decodeLayerImage({
  src,
}: {
  src: string
}): Promise<AtlasBuffer | null> {
  if ((!isSafeLayerSrc({ src }) && !isObjectUrlSrc({ src })) || typeof document === 'undefined') {
    return null
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const { width, height } = layerRasterSize({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        svg: isSvgSrc({ src }),
      })
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

/**
 * How many visible images on the document would publish as a placeholder:
 * those with no source yet, and those that can't be decoded (R04).
 */
export async function countUnavailableImages({
  document,
  decode = decodeLayerImage,
}: {
  document: DesignDocument
  decode?: (input: { src: string }) => Promise<AtlasBuffer | null>
}) {
  const missing = document.layers.filter((layer) => layer.kind === 'graphic' && layer.visible && layer.missing).length
  const decoded = await Promise.all(listLayerSrcs({ document }).map((src) => decode({ src })))

  return missing + decoded.filter((image) => !image).length
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

/**
 * Decodes `srcs` and hands over the result, unless the returned cancel ran
 * first, so a slow older batch can't replace a newer one.
 */
export function loadLayerImages({
  srcs,
  decode = decodeLayerImage,
  onLoaded,
}: {
  srcs: string[]
  decode?: (input: { src: string }) => Promise<AtlasBuffer | null>
  onLoaded: (images: Record<string, AtlasBuffer>) => void
}) {
  let cancelled = false

  void Promise.all(
    srcs.map(async (src) => {
      const decoded = await decode({ src })
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

    onLoaded(next)
  })

  return () => {
    cancelled = true
  }
}

export function useLayerImages({
  document,
}: {
  document: DesignDocument
}) {
  return useLayerImageLoad({ document }).images
}

/** The decoded images, and whether the batch for this document has finished. */
export function useLayerImageLoad({
  document,
}: {
  document: DesignDocument
}) {
  const [loaded, setLoaded] = useState<{ key: string; images: Record<string, AtlasBuffer> }>({ key: '', images: {} })
  const srcKey = listLayerSrcs({ document }).join('|')

  useEffect(() => {
    const srcs = srcKey ? srcKey.split('|') : []

    if (srcs.length === 0) {
      setLoaded({ key: '', images: {} })
      return
    }

    return loadLayerImages({ srcs, onLoaded: (images) => setLoaded({ key: srcKey, images }) })
  }, [srcKey])

  return { images: loaded.images, settled: loaded.key === srcKey }
}
