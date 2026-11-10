import type { CanonicalDocument } from './canonical-document'
import { type DesignSummary, getOwnedDesign, getPublication } from './flp-api/client'
import { publicImagePath } from './flp-api/publication'
import { decodeDocumentImages } from './layer-images'
import { LIBRARY_ASSET_SOURCES } from './library-assets'
import { type AtlasBuffer, rasterizeLayers } from './paint-atlas'
import { atlasSourceRect } from './panel-uv'
import { toRenderDocument } from './render-projection'
import { resolveUploadedSources } from './uploaded-images'

/**
 * The picture on a My Studio card (P3). A design whose published version is
 * its latest shows the stored front view; any other design gets a flat front
 * drawn here from its latest saved version by the atlas renderer. Nothing new
 * is stored: stills live in memory for this page session.
 */

export type DesignThumbnail = { kind: 'render' | 'still'; src: string }

const ATLAS_SIZE = 512
const STILL_WIDTH = 240
const STILL_HEIGHT = 260

const cache = new Map<string, Promise<DesignThumbnail | null>>()

/** Thumbnails follow the saved version: a new save makes a new key. */
export function thumbnailKey({ design }: { design: DesignSummary }) {
  return `${design.id}:${design.headSeq ?? 0}:${design.visibility}`
}

/** The stored front view, but only when the published version is the latest. */
export function storedRenderSrc({
  publication,
  headSeq,
}: {
  publication: { slug: string; status: 'published' | 'revoked'; seq: number | null } | null
  headSeq: number | null
}) {
  if (!publication || publication.status !== 'published' || publication.seq === null || publication.seq !== headSeq) {
    return null
  }

  return publicImagePath({ slug: publication.slug, seq: publication.seq })
}

export function baseColorOf({ document }: { document: CanonicalDocument }) {
  return document.base.kind === 'solid' ? document.base.color : document.base.colors[0]
}

/** A plain crew-neck tee outline in a `width` × `height` box. */
export function teeOutline({ width, height }: { width: number; height: number }) {
  const x = (fraction: number) => fraction * width
  const y = (fraction: number) => fraction * height
  const path = new Path2D()
  path.moveTo(x(0.36), y(0.04))
  path.quadraticCurveTo(x(0.5), y(0.13), x(0.64), y(0.04))
  path.lineTo(x(0.86), y(0.12))
  path.lineTo(x(0.99), y(0.34))
  path.lineTo(x(0.83), y(0.41))
  path.lineTo(x(0.8), y(0.33))
  path.lineTo(x(0.8), y(0.97))
  path.lineTo(x(0.2), y(0.97))
  path.lineTo(x(0.2), y(0.33))
  path.lineTo(x(0.17), y(0.41))
  path.lineTo(x(0.01), y(0.34))
  path.lineTo(x(0.14), y(0.12))
  path.closePath()
  return path
}

/** Draws the front panel onto a tee shape and returns a PNG data URL. */
function drawStill({ atlas, color, aspect }: { atlas: AtlasBuffer; color: string; aspect: number }) {
  const source = document.createElement('canvas')
  source.width = atlas.width
  source.height = atlas.height
  source.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(atlas.pixels), atlas.width, atlas.height), 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = STILL_WIDTH
  canvas.height = STILL_HEIGHT
  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  const outline = teeOutline({ width: STILL_WIDTH, height: STILL_HEIGHT })
  context.save()
  context.clip(outline)
  context.fillStyle = color
  context.fillRect(0, 0, STILL_WIDTH, STILL_HEIGHT)
  // The front panel at its true shape, across the body from the shoulders.
  const front = atlasSourceRect({ panel: 'front', width: atlas.width, height: atlas.height })
  const bodyWidth = STILL_WIDTH * 0.6
  context.drawImage(
    source,
    front.sourceX,
    front.sourceY,
    front.sourceWidth,
    front.sourceHeight,
    STILL_WIDTH * 0.2,
    STILL_HEIGHT * 0.04,
    bodyWidth,
    bodyWidth / aspect,
  )
  context.restore()
  context.lineWidth = 1.5
  context.strokeStyle = 'rgba(17, 17, 17, 0.28)'
  context.stroke(outline)

  return canvas.toDataURL('image/png')
}

async function drawFromHead({ designId }: { designId: string }): Promise<DesignThumbnail | null> {
  const opened = await getOwnedDesign({ designId })

  if (!opened.ok || !opened.data.head) {
    return null
  }

  const content = opened.data.head.content
  const uploaded = await resolveUploadedSources({ document: content })

  try {
    const projected = toRenderDocument({ document: content, assetSources: { ...LIBRARY_ASSET_SOURCES, ...uploaded } }).document
    const images = await decodeDocumentImages({ document: projected })
    const atlas = rasterizeLayers({ document: projected, width: ATLAS_SIZE, height: ATLAS_SIZE, images })
    const src = drawStill({
      atlas,
      color: baseColorOf({ document: content }),
      aspect: projected.panelAspects?.front ?? 6 / 7,
    })
    return src ? { kind: 'still', src } : null
  } finally {
    for (const url of Object.values(uploaded)) {
      URL.revokeObjectURL(url)
    }
  }
}

async function loadThumbnail({ design }: { design: DesignSummary }): Promise<DesignThumbnail | null> {
  if (design.headSeq === null) {
    return null
  }

  if (design.visibility === 'published') {
    const publication = await getPublication({ designId: design.id })
    const src = publication.ok ? storedRenderSrc({ publication: publication.data.publication, headSeq: design.headSeq }) : null

    if (src) {
      return { kind: 'render', src }
    }
  }

  return drawFromHead({ designId: design.id })
}

/** One load per saved version; a failure can be tried again later. */
export function designThumbnail({ design }: { design: DesignSummary }) {
  const key = thumbnailKey({ design })
  const existing = cache.get(key)

  if (existing) {
    return existing
  }

  const loading = loadThumbnail({ design }).catch(() => null)
  cache.set(key, loading)
  void loading.then((result) => {
    if (!result) {
      cache.delete(key)
    }
  })
  return loading
}

