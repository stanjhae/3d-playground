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
 * Cloth surface for the tee, made here rather than sourced, so it carries no
 * third-party rights (docs/asset-rights.md). A height field of fine knit and
 * soft crinkle, turned into a tangent-space normal map. It only changes how
 * light falls on the cloth: geometry, UVs and the print atlas stay as they are.
 */

const SIZE = 256
/** One knit stitch every this many texels. */
const KNIT_PERIOD = 4
const KNIT_DEPTH = 0.07

/**
 * Whole cycles per tile, so the tile repeats without a seam. Mostly upright,
 * as cloth hangs, and shallow: a blotchy surface reads as marble, not cotton.
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

const STEEPNESS = 0.5

function clothHeight({ x, y }: { x: number; y: number }) {
  const tau = Math.PI * 2
  const knit =
    Math.sin((tau * x) / KNIT_PERIOD) * Math.sin((tau * y) / KNIT_PERIOD) * KNIT_DEPTH
  let crinkle = 0

  for (const { fx, fy, phase, depth } of CRINKLES) {
    crinkle += Math.sin((tau * (fx * x + fy * y)) / SIZE + phase) * depth
  }

  return knit + crinkle
}

/** RGBA normal-map texels for one tile, row by row. Same result every time. */
export function clothNormalTexels() {
  const texels = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (clothHeight({ x: x + 1, y }) - clothHeight({ x: x - 1, y })) * STEEPNESS
      const dy = (clothHeight({ x, y: y + 1 }) - clothHeight({ x, y: y - 1 })) * STEEPNESS
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

let shared: DataTexture | null = null

/** One texture for every tee on the page; each renderer uploads its own copy. */
export function clothNormalMap() {
  if (shared) {
    return shared
  }

  const { size, texels } = clothNormalTexels()
  const texture = new DataTexture(texels, size, size, RGBAFormat, UnsignedByteType)
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(3, 3)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  shared = texture
  return texture
}
