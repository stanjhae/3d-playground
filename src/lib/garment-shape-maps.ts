import { type GarmentShape, isNeutralShape } from './garment-shape-params.ts'

/**
 * Region maps for the shape sliders beyond the tee: the hoodie, vest, crop
 * top, dress and trousers. Like the tee's (`garment-shape.ts`), each moves
 * vertices only, never adds or removes one, and leaves UVs alone, so
 * prints ride along with the cloth.
 *
 * Each model is pinned by its template version (a new mesh is a new
 * version), so its landmarks are constants here, measured from the model
 * in garment space (+x the wearer's left, +y up, +z the front, metres).
 * `garment-shape-maps.test.ts` measures them again from each GLB and checks
 * these numbers, then checks the limits keep every seam sewn and no row of
 * cloth crosses another.
 *
 * Every displacement is a function of a vertex's position and its part, so
 * cloth that two meshes share (the hoodie is layered: its sleeves, cuffs,
 * hood and hem band are sewn to the body vertex for vertex) moves as one.
 */

export type ShapeMapPart = 'body' | 'sleeves' | 'body-or-sleeves'

/** What the rig needs from a template's map (`createShapeRig`). */
export type ShapeMap<Frame = unknown> = {
  /** Mesh (or ancestor) name → the part the map treats it as. */
  parts: Record<string, string>
  /** The landmarks, from the model's parts in garment space; null when they can't be found. */
  measure: (input: { parts: { part: string; positions: ArrayLike<number> }[] }) => Frame | null
  /** The displaced copy of `positions` (flat xyz, garment space). */
  deform: (input: { positions: ArrayLike<number>; part: string; shape: GarmentShape; frame: Frame }) => Float32Array
}

type Vec3 = readonly [number, number, number]

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Width eases in over this far below the armpit, so the armholes don't open. */
const WIDTH_EASE = 0.1
/** The deepest neckline drop, metres (the tee's). */
const NECK_DROP = 0.08
/** The drop fades out over this far below the neckline; > NECK_DROP, so no folds. */
const NECK_FADE = 0.15

/** Body length: everything below `topY` moves, the hem by `drop`. */
function lengthDrop({ y, topY, bandY, drop }: { y: number; topY: number; bandY: number; drop: number }) {
  return y < topY ? clamp01((topY - y) / (topY - bandY)) * drop : 0
}

// --- Hoodie ------------------------------------------------------------------

type HoodieSleeve = {
  /** Unit direction armpit → cuff (the arms hang down and a little forward). */
  axis: Vec3
  /** Top of the ribbed cuff: below it the cuff moves whole. */
  cuffBandY: number
  /** Which way is out from the body, in x. */
  side: 1 | -1
}

export type HoodieFrame = {
  centerX: number
  /** The lowest point where a sleeve is sewn to the body. */
  armpitY: number
  /** Top of the ribbed hem band: below it the band moves whole. */
  hemBandY: number
  /** Half the body's width just below the armpits: how far out a sleeve hangs. */
  halfWidth: number
  sleeves: { plusX: HoodieSleeve; minusX: HoodieSleeve }
}

function unit(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector)
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

/** `hoodie@1`, measured from `public/models/hoodie.glb`. */
export const HOODIE_FRAME: HoodieFrame = {
  centerX: -0.0023,
  armpitY: 1.164,
  hemBandY: 1.0,
  halfWidth: 0.22,
  sleeves: {
    // Armpit-level centroid → cuff centroid of each sleeve.
    plusX: { axis: unit([0.027, -0.262, 0.102]), cuffBandY: 0.96, side: 1 },
    minusX: { axis: unit([-0.024, -0.254, 0.112]), cuffBandY: 0.96, side: -1 },
  },
}

/** The hoodie's neck rib (in `body-4` with the left sleeve and both cuffs) sits above this. */
const HOODIE_NECK_RIB_Y = 1.5

function deformHoodie({
  positions,
  part,
  shape,
  frame,
}: {
  positions: ArrayLike<number>
  part: string
  shape: GarmentShape
  frame: HoodieFrame
}) {
  const out = Float32Array.from(positions)

  if (isNeutralShape({ shape })) {
    return out
  }

  const { centerX, armpitY, hemBandY } = frame
  const drop = (armpitY - hemBandY) * (shape.bodyLength ?? 0)
  const width = shape.bodyWidth ?? 0

  for (let index = 0; index < out.length; index += 3) {
    const x = positions[index]!
    const y = positions[index + 1]!
    const z = positions[index + 2]!
    const sleeve = part === 'sleeves' || (part === 'body-or-sleeves' && y <= HOODIE_NECK_RIB_Y)
    let [dx, dy, dz] = [0, 0, 0]

    if (y < armpitY) {
      const ease = smoothstep(0, WIDTH_EASE, armpitY - y)

      if (sleeve) {
        const { axis, cuffBandY, side } = x >= centerX ? frame.sleeves.plusX : frame.sleeves.minusX
        const amount = (side === 1 ? shape.leftSleeveLength : shape.rightSleeveLength) ?? 0
        // The sleeve below the armpit stretches along the arm; the cuff rides along whole.
        const span = (armpitY - cuffBandY) / -axis[1]
        const along = clamp01((armpitY - y) / (armpitY - cuffBandY)) * amount * span
        dx += axis[0] * along
        dy += axis[1] * along
        dz += axis[2] * along
        // A wider body carries its sleeves out with it.
        dx += side * width * frame.halfWidth * ease
      } else {
        dy -= lengthDrop({ y, topY: armpitY, bandY: hemBandY, drop })
        dx += (x - centerX) * width * ease
      }
    }

    out[index] = x + dx
    out[index + 1] = y + dy
    out[index + 2] = z + dz
  }

  return out
}

export const HOODIE_SHAPE_MAP: ShapeMap<HoodieFrame> = {
  parts: {
    body: 'body',
    'body-3': 'body',
    // The hood's left side and the hem band.
    'body-5': 'body',
    'body-6': 'body',
    'body-1': 'sleeves',
    'body-2': 'sleeves',
    'body-7': 'sleeves',
    // The left sleeve's top, both cuffs, and the neck rib.
    'body-4': 'body-or-sleeves',
  },
  measure: () => HOODIE_FRAME,
  deform: deformHoodie,
}

// --- Vest, crop top, dress -----------------------------------------------------

export type BodiceFrame = {
  centerX: number
  centerZ: number
  hemY: number
  /** Where the armholes bottom out: width eases in below. */
  armpitY: number
  /** Where length starts: the armpit, or the dress's waist. */
  lengthTopY: number
  /** The flare starts here and grows toward the hem (the dress). */
  flareTopY: number
  /** The neckline's lowest point, its half width, and the depth (z) between its front and back. */
  neck: { bottomY: number; halfWidth: number; centerZ: number }
}

/** `vest@1`: sleeveless, with a V neck. */
export const VEST_FRAME: BodiceFrame = {
  centerX: 0.0009,
  centerZ: 0.006,
  hemY: 0.846,
  armpitY: 1.179,
  lengthTopY: 1.179,
  flareTopY: 1.179,
  neck: { bottomY: 1.233, halfWidth: 0.076, centerZ: 0.005 },
}

/** `crop@1`: short set-in sleeves in the same mesh, above the armpit. */
export const CROP_FRAME: BodiceFrame = {
  centerX: 0.0013,
  centerZ: -0.0045,
  hemY: 1.069,
  armpitY: 1.23,
  lengthTopY: 1.23,
  flareTopY: 1.23,
  neck: { bottomY: 1.439, halfWidth: 0.082, centerZ: 0 },
}

/** `dress@1`: sleeveless; its length and flare are the skirt's, from the waist. */
export const DRESS_FRAME: BodiceFrame = {
  centerX: -0.0001,
  centerZ: 0.0016,
  hemY: 0.312,
  armpitY: 1.275,
  lengthTopY: 0.99,
  flareTopY: 0.99,
  neck: { bottomY: 1.409, halfWidth: 0.089, centerZ: 0.0015 },
}

function deformBodice({ positions, shape, frame }: { positions: ArrayLike<number>; shape: GarmentShape; frame: BodiceFrame }) {
  const out = Float32Array.from(positions)

  if (isNeutralShape({ shape })) {
    return out
  }

  const { centerX, centerZ, hemY, armpitY, lengthTopY, flareTopY, neck } = frame
  const drop = (lengthTopY - hemY) * (shape.bodyLength ?? 0)
  const width = shape.bodyWidth ?? 0
  const flare = shape.hemFlare ?? 0
  const neckDrop = NECK_DROP * (shape.necklineDepth ?? 0)

  for (let index = 0; index < out.length; index += 3) {
    const x = positions[index]!
    const y = positions[index + 1]!
    const z = positions[index + 2]!
    let [dx, dy, dz] = [0, 0, 0]

    dy -= lengthDrop({ y, topY: lengthTopY, bandY: hemY, drop })

    if (width !== 0 && y < armpitY) {
      dx += (x - centerX) * width * smoothstep(0, WIDTH_EASE, armpitY - y)
    }

    // The skirt opens toward the hem, round (x and z), from nothing at the waist.
    if (flare !== 0 && y < flareTopY) {
      const t = clamp01((flareTopY - y) / (flareTopY - hemY))
      dx += (x - centerX) * flare * t * t
      dz += (z - centerZ) * flare * t * t
    }

    // The tee's neckline: the centre front drops, the sides and back stay.
    if (neckDrop !== 0) {
      const across = Math.min(1, Math.abs(x - centerX) / neck.halfWidth)
      const profile = Math.cos((across * Math.PI) / 2) ** 2
      const front = smoothstep(neck.centerZ - 0.01, neck.centerZ + 0.05, z)
      const down = clamp01(1 - (neck.bottomY - y) / NECK_FADE)
      dy -= neckDrop * profile * front * down
    }

    out[index] = x + dx
    out[index + 1] = y + dy
    out[index + 2] = z + dz
  }

  return out
}

/** A baked pattern garment: one mesh, `body-pattern`, under `pattern-garment`. */
function bodiceMap(frame: BodiceFrame): ShapeMap<BodiceFrame> {
  return {
    parts: { 'body-pattern': 'body' },
    measure: () => frame,
    deform: ({ positions, shape, frame: measured }) => deformBodice({ positions, shape, frame: measured }),
  }
}

export const VEST_SHAPE_MAP = bodiceMap(VEST_FRAME)
export const CROP_SHAPE_MAP = bodiceMap(CROP_FRAME)
export const DRESS_SHAPE_MAP = bodiceMap(DRESS_FRAME)

// --- Trousers -------------------------------------------------------------------

export type TrousersFrame = {
  centerX: number
  /** The top of the gap between the legs: below it each leg is its own tube. */
  crotchY: number
  hemY: number
  /** The waist and hip width fades out over this far below the crotch. */
  hipFade: number
}

/** `trousers@1`. */
export const TROUSERS_FRAME: TrousersFrame = {
  centerX: 0,
  crotchY: 0.6805,
  hemY: 0.039,
  hipFade: 0.2,
}

function deformTrousers({ positions, shape, frame }: { positions: ArrayLike<number>; shape: GarmentShape; frame: TrousersFrame }) {
  const out = Float32Array.from(positions)

  if (isNeutralShape({ shape })) {
    return out
  }

  const { centerX, crotchY, hemY, hipFade } = frame
  const width = shape.waistWidth ?? 0

  for (let index = 0; index < out.length; index += 3) {
    const x = positions[index]!
    const y = positions[index + 1]!
    let [dx, dy] = [0, 0]

    // Each leg, crotch to hem: weight 0 at the crotch, so the legs stay joined there.
    if (y < crotchY) {
      const amount = (x >= centerX ? shape.leftLegLength : shape.rightLegLength) ?? 0
      dy -= clamp01((crotchY - y) / (crotchY - hemY)) * amount * (crotchY - hemY)
    }

    if (width !== 0) {
      dx += (x - centerX) * width * smoothstep(crotchY - hipFade, crotchY, y)
    }

    out[index] = x + dx
    out[index + 1] = y + dy
  }

  return out
}

export const TROUSERS_SHAPE_MAP: ShapeMap<TrousersFrame> = {
  parts: { 'body-pattern': 'body' },
  measure: () => TROUSERS_FRAME,
  deform: deformTrousers,
}

/** A map with its frame type forgotten, for a table of maps: each measures its own frame. */
export function eraseFrame<Frame>(map: ShapeMap<Frame>): ShapeMap {
  return map as unknown as ShapeMap
}

/** The non-tee maps by garment id (each garment has one template with a shape map). */
export const GARMENT_SHAPE_MAPS: Record<string, ShapeMap> = {
  hoodie: eraseFrame(HOODIE_SHAPE_MAP),
  vest: eraseFrame(VEST_SHAPE_MAP),
  crop: eraseFrame(CROP_SHAPE_MAP),
  dress: eraseFrame(DRESS_SHAPE_MAP),
  trousers: eraseFrame(TROUSERS_SHAPE_MAP),
}
