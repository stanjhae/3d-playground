import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three'

/**
 * Cloth surface relief, made here rather than sourced, so it carries no
 * third-party rights (docs/asset-rights.md). Each detail is a height field
 * that tiles without a seam (every period divides SIZE), turned into a
 * tangent-space normal map. It only changes how light falls on the cloth:
 * geometry, UVs and the print atlas stay as they are.
 */

export const DETAIL_IDS = ['knit', 'twill', 'quilting', 'rib', 'satin', 'canvas'] as const

export type DetailId = (typeof DETAIL_IDS)[number]

export const DETAIL_LABELS: Record<DetailId, string> = {
  knit: 'Knit',
  twill: 'Twill',
  quilting: 'Quilted',
  rib: 'Rib',
  satin: 'Satin',
  canvas: 'Canvas',
}

/**
 * The studio's Surface choice: the fabric's own relief, none, or a named one.
 * A view setting, not part of the design document (no reader change).
 */
export type SurfaceChoice = 'preset' | 'none' | DetailId

export const SURFACE_CHOICES: readonly SurfaceChoice[] = ['preset', ...DETAIL_IDS, 'none']

/** The relief a cloth shows, given its preset and the Surface choice. */
export function resolveDetail({
  detailId,
  detailScale,
  surface = 'preset',
}: {
  detailId?: DetailId
  detailScale?: number
  surface?: SurfaceChoice
}): { id: DetailId; scale: number } | null {
  if (surface === 'none') {
    return null
  }

  if (surface !== 'preset') {
    return { id: surface, scale: surface === detailId ? (detailScale ?? 1) : 1 }
  }

  return detailId ? { id: detailId, scale: detailScale ?? 1 } : null
}

const SIZE = 256
const TAU = Math.PI * 2

/** Wraps a texel coordinate into the tile, so lookups past an edge repeat it. */
const wrap = (value: number) => ((value % SIZE) + SIZE) % SIZE

/** Deterministic 0–1 hash of a lattice point, wrapped to `period`. */
function hash({ x, y, period, seed }: { x: number; y: number; period: number; seed: number }) {
  const wx = ((x % period) + period) % period
  const wy = ((y % period) + period) % period
  let h = (wx * 374761393 + wy * 668265263 + seed * 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/**
 * Smooth value noise that tiles: `cells` lattice cells across the tile, or
 * `cellsX` by `cellsY` for a stretched grain.
 */
function noise({
  x,
  y,
  cells = 1,
  cellsX = cells,
  cellsY = cells,
  seed,
}: {
  x: number
  y: number
  cells?: number
  cellsX?: number
  cellsY?: number
  seed: number
}) {
  const fx = (wrap(x) / SIZE) * cellsX
  const fy = (wrap(y) / SIZE) * cellsY
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0))
  const sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0))
  const at = (dx: number, dy: number) =>
    hash({ x: ((x0 + dx) % cellsX) * 7919 + ((y0 + dy) % cellsY), y: 0, period: 2 ** 31, seed })
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * sx
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * sx
  return top + (bottom - top) * sy
}

/**
 * Whole cycles per tile, mostly upright, as cloth hangs, and shallow: a
 * blotchy surface reads as marble, not cotton. The knit's own drape.
 */
const CRINKLES = [
  { fx: 3, fy: 1, phase: 0.4, depth: 0.5 },
  { fx: -4, fy: 1, phase: 2.1, depth: 0.45 },
  { fx: 5, fy: 2, phase: 4.2, depth: 0.32 },
  { fx: -7, fy: 2, phase: 1.3, depth: 0.22 },
  { fx: 9, fy: -3, phase: 3.3, depth: 0.16 },
  { fx: 2, fy: 5, phase: 5.1, depth: 0.1 },
  { fx: -13, fy: 4, phase: 2.7, depth: 0.08 },
] as const

function crinkle({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  let sum = 0

  for (const { fx, fy, phase, depth } of CRINKLES) {
    sum += Math.sin((TAU * (fx * x + fy * y)) / SIZE + phase) * depth * scale
  }

  return sum
}

type Height = (point: { x: number; y: number }) => number

type Detail = {
  height: Height
  /** Slope multiplier: how strongly the relief tilts the normal. */
  steepness: number
  /** Tiles across a garment's UV square. */
  repeat: number
}

const DETAILS: Record<DetailId, Detail> = {
  /** The tee's cloth: a fine knit stitch every 4 texels over soft crinkle. */
  knit: {
    height: ({ x, y }) =>
      Math.sin((TAU * x) / 4) * Math.sin((TAU * y) / 4) * 0.07 + crinkle({ x, y }),
    steepness: 0.5,
    repeat: 3,
  },
  /** Diagonal ribs of a 2/1 twill, as on denim and gabardine. */
  twill: {
    height: ({ x, y }) => {
      const rib = Math.sin((TAU * (x + y)) / 8)
      return Math.sign(rib) * Math.abs(rib) ** 0.6 * 0.12 + crinkle({ x, y, scale: 0.4 })
    },
    steepness: 0.6,
    repeat: 4,
  },
  /** Diamond quilting: puffed cells between sunken stitch lines. */
  quilting: {
    height: ({ x, y }) => {
      const u = wrap(x + y) % 64
      const v = wrap(x - y) % 64
      const puff = Math.sin((Math.PI * u) / 64) * Math.sin((Math.PI * v) / 64)
      return Math.sqrt(Math.max(puff, 0)) * 3
    },
    steepness: 0.5,
    repeat: 2,
  },
  /** Upright ribs of a 1×1 rib knit. */
  rib: {
    height: ({ x, y }) => {
      const rib = Math.sin((TAU * x) / 8)
      return Math.abs(rib) ** 0.5 * 0.3 + crinkle({ x, y, scale: 0.3 })
    },
    steepness: 0.5,
    repeat: 4,
  },
  /** Satin: smooth long floats, so only a faint horizontal ripple. */
  satin: {
    height: ({ x, y }) =>
      Math.sin((TAU * y) / 4) * 0.015 + (noise({ x, y, cellsX: 8, cellsY: 64, seed: 5 }) - 0.5) * 0.5,
    steepness: 0.4,
    repeat: 2,
  },
  /** Canvas duck: coarse over-under yarns with grit. */
  canvas: {
    height: ({ x, y }) => {
      const period = 8
      const cx = wrap(x)
      const cy = wrap(y)
      const over = (Math.floor(cx / period) + Math.floor(cy / period)) % 2 === 0
      const yarn = over ? Math.sin((Math.PI * (cy % period)) / period) : Math.sin((Math.PI * (cx % period)) / period)
      return yarn * 0.6 + (noise({ x, y, cells: 64, seed: 31 }) - 0.5) * 0.6
    },
    steepness: 0.5,
    repeat: 4,
  },
}

/** RGBA normal-map texels for one tile of `id`, row by row. Same result every time. */
export function detailNormalTexels({ id }: { id: DetailId }) {
  const { height, steepness } = DETAILS[id]
  const texels = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (height({ x: x + 1, y }) - height({ x: x - 1, y })) * steepness
      const dy = (height({ x, y: y + 1 }) - height({ x, y: y - 1 })) * steepness
      const scale = 1 / Math.hypot(dx, dy, 1)
      const at = (y * SIZE + x) * 4

      texels[at] = Math.round((-dx * scale * 0.5 + 0.5) * 255)
      texels[at + 1] = Math.round((-dy * scale * 0.5 + 0.5) * 255)
      texels[at + 2] = Math.round((scale * 0.5 + 0.5) * 255)
      texels[at + 3] = 255
    }
  }

  return { size: SIZE, texels }
}

export function isDetailId(value: unknown): value is DetailId {
  return typeof value === 'string' && (DETAIL_IDS as readonly string[]).includes(value)
}

const cache = new Map<DetailId, DataTexture>()

/** One texture per detail for the whole page; each renderer uploads its own copy. */
export function detailNormalMap({ id }: { id: DetailId }) {
  const cached = cache.get(id)

  if (cached) {
    return cached
  }

  const { size, texels } = detailNormalTexels({ id })
  const texture = new DataTexture(texels, size, size, RGBAFormat, UnsignedByteType)
  texture.name = `detail:${id}`
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(DETAILS[id].repeat, DETAILS[id].repeat)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  cache.set(id, texture)
  return texture
}
