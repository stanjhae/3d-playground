import type { CanonicalDocument } from './canonical-document'
import { type DesignSummary, getOwnedDesign, getPublication } from './flp-api/client'
import { publicImagePath } from './flp-api/publication'
import { FRONT_OUTLINES } from './front-outlines.gen'
import { decodeDocumentImages } from './layer-images'
import { LIBRARY_ASSET_SOURCES } from './library-assets'
import { type AtlasBuffer, rasterizeLayers } from './paint-atlas'
import { atlasSourceRect } from './panel-uv'
import { toRenderDocument } from './render-projection'
import { resolveUploadedSources } from './uploaded-images'
import { type GarmentShape, NEUTRAL_SHAPE } from './garment-shape-params'

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

/**
 * What a card shows while its thumbnail key changes: the picture for this
 * key once it's loaded, and until then the last one loaded for the same
 * design, so publishing or unpublishing never drops it back to the
 * placeholder in between.
 */
export function keptThumbnail({
  loaded,
  key,
}: {
  loaded: { key: string; thumbnail: DesignThumbnail | null } | null
  key: string
}) {
  if (!loaded) {
    return null
  }

  const sameDesign = loaded.key.split(':')[0] === key.split(':')[0]
  return loaded.key === key || sameDesign ? loaded.thumbnail : null
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

/**
 * The tee outline's corners, as fractions of the still, following the
 * design's shape (shape v1): sleeves stretch from the shoulder, the hem
 * moves, the body widens below the armpits and the neckline dips. From the
 * front the wearer's left sleeve is on screen right. May reach past 0–1;
 * `teeStillScale` fits it back in.
 */
export function teeOutlinePoints({ shape }: { shape?: GarmentShape }) {
  const s = { ...NEUTRAL_SHAPE, ...shape }
  const sleeve = ({ shoulder, armpit, cuffTop, cuffBottom, length }: Record<'shoulder' | 'armpit' | 'cuffTop' | 'cuffBottom', [number, number]> & { length: number }) => {
    const reach = 1 + length
    return {
      top: [shoulder[0] + (cuffTop[0] - shoulder[0]) * reach, shoulder[1] + (cuffTop[1] - shoulder[1]) * reach] as [number, number],
      bottom: [armpit[0] + (cuffBottom[0] - armpit[0]) * reach, armpit[1] + (cuffBottom[1] - armpit[1]) * reach] as [number, number],
    }
  }
  const right = sleeve({ shoulder: [0.86, 0.12], armpit: [0.8, 0.33], cuffTop: [0.99, 0.34], cuffBottom: [0.83, 0.41], length: s.leftSleeveLength })
  const left = sleeve({ shoulder: [0.14, 0.12], armpit: [0.2, 0.33], cuffTop: [0.01, 0.34], cuffBottom: [0.17, 0.41], length: s.rightSleeveLength })
  const hem = 0.33 + 0.64 * (1 + s.bodyLength)
  const half = 0.3 * (1 + s.bodyWidth)

  return {
    neck: { left: [0.36, 0.04], dip: [0.5, 0.13 + 0.4 * s.necklineDepth], right: [0.64, 0.04] } as const,
    body: [
      [0.86, 0.12],
      right.top,
      right.bottom,
      [0.8, 0.33],
      [0.5 + half, hem],
      [0.5 - half, hem],
      [0.2, 0.33],
      left.bottom,
      left.top,
      [0.14, 0.12],
    ] as [number, number][],
  }
}

/** How far a shaped still shrinks (about its top centre) to fit its box. */
export function teeStillScale({ shape }: { shape?: GarmentShape }) {
  const { body } = teeOutlinePoints({ shape })
  const reach = Math.max(...body.map(([x]) => Math.abs(x - 0.5))) / 0.49
  const depth = Math.max(...body.map(([, y]) => y)) / 0.97
  return 1 / Math.max(1, reach, depth)
}

/** A crew-neck tee outline in a `width` × `height` box, in the design's shape. */
export function teeOutline({ width, height, shape }: { width: number; height: number; shape?: GarmentShape }) {
  const x = (fraction: number) => fraction * width
  const y = (fraction: number) => fraction * height
  const { neck, body } = teeOutlinePoints({ shape })
  const path = new Path2D()
  path.moveTo(x(neck.left[0]), y(neck.left[1]))
  // `dip` is the curve's control point; neutral is the plain crew neck.
  path.quadraticCurveTo(x(neck.dip[0]), y(neck.dip[1]), x(neck.right[0]), y(neck.right[1]))

  for (const [px, py] of body) {
    path.lineTo(x(px), y(py))
  }

  path.closePath()
  return path
}

/**
 * Where the front panel sits in a `width` × `height` still: across the tee's
 * body from the shoulders, or, on any other garment, the panel itself at its
 * true shape, as large as fits with a margin.
 */
export function stillFrontBox({
  tee,
  aspect,
  width,
  height,
}: {
  tee: boolean
  aspect: number
  width: number
  height: number
}) {
  if (tee) {
    const bodyWidth = width * 0.6
    return { x: width * 0.2, y: height * 0.04, width: bodyWidth, height: bodyWidth / aspect }
  }

  const fit = Math.min((width * 0.84) / aspect, height * 0.9)
  const boxWidth = fit * aspect
  return { x: (width - boxWidth) / 2, y: (height - fit) / 2, width: boxWidth, height: fit }
}

/** A panel outline with softened corners. */
function panelOutline({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  const path = new Path2D()
  path.roundRect(x, y, width, height, Math.min(width, height) * 0.08)
  return path
}

/**
 * The front panel's own outline for a design's template (tester pass 3),
 * traced from its model (`front-outlines.gen.ts`); null when there is none.
 * Without it, a card showed a plain rectangle of the cloth colour, which on
 * a new white garment read as a blank picture.
 */
export function frontOutlineOf({ template }: { template: { id: string; version: number } }) {
  return FRONT_OUTLINES[`${template.id}@${template.version}`]?.polygons ?? null
}

/** Panel-space polygons (y up) drawn into `box`. */
function polygonOutline({ polygons, box }: { polygons: readonly (readonly number[])[]; box: { x: number; y: number; width: number; height: number } }) {
  const path = new Path2D()

  for (const polygon of polygons) {
    for (let at = 0; at + 1 < polygon.length; at += 2) {
      const x = box.x + polygon[at]! * box.width
      const y = box.y + (1 - polygon[at + 1]!) * box.height

      if (at === 0) {
        path.moveTo(x, y)
      } else {
        path.lineTo(x, y)
      }
    }

    path.closePath()
  }

  return path
}

/**
 * Draws the front panel and returns a PNG data URL: onto a tee shape for the
 * tee, and as the garment's own front panel for every other garment, cut
 * from that garment's own print atlas.
 */
function drawStill({
  atlas,
  color,
  aspect,
  tee,
  shape,
  frontOutline = null,
}: {
  atlas: AtlasBuffer
  color: string
  aspect: number
  tee: boolean
  shape?: GarmentShape
  /** The front panel's own outline (`frontOutlineOf`); a rounded rectangle without one. */
  frontOutline?: readonly (readonly number[])[] | null
}) {
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

  const box = stillFrontBox({ tee, aspect, width: STILL_WIDTH, height: STILL_HEIGHT })
  const outline = tee
    ? teeOutline({ width: STILL_WIDTH, height: STILL_HEIGHT, shape })
    : frontOutline
      ? polygonOutline({ polygons: frontOutline, box })
      : panelOutline(box)
  // A long sleeve or hem shrinks the whole still to fit, about its top centre.
  const fit = tee ? teeStillScale({ shape }) : 1
  context.translate((STILL_WIDTH * (1 - fit)) / 2, 0)
  context.scale(fit, fit)
  context.save()
  context.clip(outline)
  context.fillStyle = color
  context.fillRect(0, 0, STILL_WIDTH, STILL_HEIGHT)
  // The front panel at its true shape.
  const front = atlasSourceRect({ panel: 'front', width: atlas.width, height: atlas.height, rects: atlas.panelUv })
  context.drawImage(
    source,
    front.sourceX,
    front.sourceY,
    front.sourceWidth,
    front.sourceHeight,
    box.x,
    box.y,
    box.width,
    box.height,
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
      tee: projected.garmentId === 'tee',
      shape: projected.shape,
      frontOutline: frontOutlineOf({ template: content.template }),
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
  return cached({ key: thumbnailKey({ design }), load: () => loadThumbnail({ design }) })
}

/**
 * The flat front drawn from the latest saved version, for when the stored
 * front view will not load (a slow or failed image request just after
 * publishing): the card shows the design, never the bare placeholder.
 */
export function designStill({ design }: { design: DesignSummary }) {
  if (design.headSeq === null) {
    return Promise.resolve(null)
  }

  return cached({ key: `${thumbnailKey({ design })}:still`, load: () => drawFromHead({ designId: design.id }) })
}

function cached({ key, load }: { key: string; load: () => Promise<DesignThumbnail | null> }) {
  const existing = cache.get(key)

  if (existing) {
    return existing
  }

  const loading = load().catch(() => null)
  cache.set(key, loading)
  void loading.then((result) => {
    if (!result) {
      cache.delete(key)
    }
  })
  return loading
}

