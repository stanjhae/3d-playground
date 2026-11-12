import { BufferAttribute, type BufferGeometry, Matrix4, Vector3 } from 'three'

import { type GarmentShape, isNeutralShape } from './garment-shape-params.ts'

/**
 * Parametric shape v1: sliders that deform the real tee (template v4).
 *
 * The garment keeps its mesh: every vertex moves, none is added or removed,
 * and UVs (fabric and print) are untouched, so prints, strokes and graphics
 * ride along with the cloth. Displacement is a field over garment space
 * (the seated model: +x is the wearer's left, +y up, +z the front):
 *
 * - **Sleeves** stretch along their own axis, shoulder seam → cuff. The
 *   weight is a vertex's distance from the armhole seam over the sleeve's
 *   longest such distance, so the seam stays sewn to the body and the cuff
 *   moves the most.
 * - **Body length** moves the hem: weight runs 0 at the armpit to 1 at the
 *   hem, so everything above the armpits stays put.
 * - **Body width** widens about the centre line below the armpits, easing
 *   in over the first few centimetres so the armholes don't open.
 * - **Neckline depth** drops the front of the collar ring and the chest
 *   fabric under it, most at the centre front and nothing at the sides or
 *   back, fading down the chest so the cloth never folds over itself.
 *
 * Every value is a fraction, 0 is neutral, and a neutral shape returns the
 * input untouched.
 */

export {
  clampShape,
  clampShapeValue,
  type GarmentShape,
  isNeutralShape,
  NEUTRAL_SHAPE,
  SHAPE_FIELDS,
  SHAPE_LIMITS,
  type ShapeField,
  templateHasShape,
} from './garment-shape-params.ts'

/** What each mesh of the v4 tee is to the deformer. */
export type ShapePart = 'body' | 'sleeves' | 'collar'

export const TEE_V4_SHAPE_PARTS: Record<string, ShapePart> = {
  'body-front': 'body',
  'body-back': 'body',
  'body-sleeves': 'sleeves',
  'body-collar': 'collar',
}

type SleeveFrame = {
  /** Seam vertices, flat xyz in garment space. */
  seam: Float32Array
  /** Unit direction shoulder → cuff. */
  axis: [number, number, number]
  /** Longest distance from the seam; the cuff's. */
  reach: number
}

/** Landmarks the field is built from, measured once per model. */
export type ShapeFrame = {
  /** Centre line x. */
  centerX: number
  hemY: number
  armpitY: number
  /** +x is the wearer's left (template v4 `left` = piece `+x`). */
  sleeves: { plusX: SleeveFrame | null; minusX: SleeveFrame | null }
  collar: { bottomY: number; halfWidth: number; centerZ: number } | null
}

export type ShapeMeasurePart = {
  part: ShapePart
  /** Flat xyz in garment space. */
  positions: ArrayLike<number>
}

/** Within this, a sleeve vertex sits on the armhole seam. */
const SEAM_GAP = 0.006
/** Width eases in over this far below the armpit. */
const WIDTH_EASE = 0.1
/** The deepest neckline drop, metres. */
const NECK_DROP = 0.08
/** The drop fades out over this far below the collar; > NECK_DROP, so no folds. */
const NECK_FADE = 0.15

function bounds({ positions, axis }: { positions: ArrayLike<number>; axis: 0 | 1 | 2 }) {
  let min = Infinity
  let max = -Infinity

  for (let index = axis; index < positions.length; index += 3) {
    min = Math.min(min, positions[index]!)
    max = Math.max(max, positions[index]!)
  }

  return { min, max }
}

/** Spatial hash of points for nearest-neighbour checks within one cell. */
function gridOf({ positions, cell }: { positions: ArrayLike<number>; cell: number }) {
  const grid = new Map<string, number[]>()

  for (let index = 0; index < positions.length; index += 3) {
    const key = `${Math.floor(positions[index]! / cell)},${Math.floor(positions[index + 1]! / cell)},${Math.floor(positions[index + 2]! / cell)}`
    const bucket = grid.get(key)

    if (bucket) {
      bucket.push(index)
    } else {
      grid.set(key, [index])
    }
  }

  return grid
}

function nearAny({
  grid,
  positions,
  cell,
  x,
  y,
  z,
  gap,
}: {
  grid: Map<string, number[]>
  positions: ArrayLike<number>
  cell: number
  x: number
  y: number
  z: number
  gap: number
}) {
  const [i, j, k] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)]

  for (let a = -1; a <= 1; a += 1) {
    for (let b = -1; b <= 1; b += 1) {
      for (let c = -1; c <= 1; c += 1) {
        for (const at of grid.get(`${i + a},${j + b},${k + c}`) ?? []) {
          const dx = positions[at]! - x
          const dy = positions[at + 1]! - y
          const dz = positions[at + 2]! - z

          if (dx * dx + dy * dy + dz * dz <= gap * gap) {
            return true
          }
        }
      }
    }
  }

  return false
}

function seamDistance({ seam, x, y, z }: { seam: Float32Array; x: number; y: number; z: number }) {
  let best = Infinity

  for (let index = 0; index < seam.length; index += 3) {
    const dx = seam[index]! - x
    const dy = seam[index + 1]! - y
    const dz = seam[index + 2]! - z
    best = Math.min(best, dx * dx + dy * dy + dz * dz)
  }

  return Math.sqrt(best)
}

function measureSleeve({
  sleeve,
  bodyGrid,
  body,
}: {
  sleeve: number[]
  bodyGrid: Map<string, number[]>
  body: ArrayLike<number>
}): SleeveFrame | null {
  const seam: number[] = []

  for (let index = 0; index < sleeve.length; index += 3) {
    const [x, y, z] = [sleeve[index]!, sleeve[index + 1]!, sleeve[index + 2]!]

    if (nearAny({ grid: bodyGrid, positions: body, cell: SEAM_GAP, x, y, z, gap: SEAM_GAP })) {
      seam.push(x, y, z)
    }
  }

  if (seam.length === 0) {
    return null
  }

  const seamPoints = new Float32Array(seam)
  const distances: number[] = []
  let reach = 0

  for (let index = 0; index < sleeve.length; index += 3) {
    const distance = seamDistance({ seam: seamPoints, x: sleeve[index]!, y: sleeve[index + 1]!, z: sleeve[index + 2]! })
    distances.push(distance)
    reach = Math.max(reach, distance)
  }

  if (reach === 0) {
    return null
  }

  // Axis: seam centroid → centroid of the far tenth (the cuff).
  const seamCentre = new Vector3()
  const cuffCentre = new Vector3()
  let cuffCount = 0

  for (let index = 0; index < seam.length; index += 3) {
    seamCentre.add(new Vector3(seam[index], seam[index + 1], seam[index + 2]))
  }

  seamCentre.divideScalar(seam.length / 3)

  distances.forEach((distance, at) => {
    if (distance >= reach * 0.9) {
      cuffCentre.add(new Vector3(sleeve[at * 3], sleeve[at * 3 + 1], sleeve[at * 3 + 2]))
      cuffCount += 1
    }
  })

  cuffCentre.divideScalar(cuffCount)
  const axis = cuffCentre.sub(seamCentre).normalize()

  return { seam: seamPoints, axis: [axis.x, axis.y, axis.z], reach }
}

/**
 * Measure the landmarks from the model's parts, in garment space. Sleeves
 * are split at the body's centre line: +x is the wearer's left.
 */
export function measureShapeFrame({ parts }: { parts: ShapeMeasurePart[] }): ShapeFrame | null {
  const body = parts.filter((part) => part.part === 'body').flatMap((part) => Array.from(part.positions))

  if (body.length === 0) {
    return null
  }

  let sumX = 0

  for (let index = 0; index < body.length; index += 3) {
    sumX += body[index]!
  }

  const centerX = sumX / (body.length / 3)
  const hemY = bounds({ positions: body, axis: 1 }).min
  const sleeves = parts.filter((part) => part.part === 'sleeves').flatMap((part) => Array.from(part.positions))
  const plusX: number[] = []
  const minusX: number[] = []

  for (let index = 0; index < sleeves.length; index += 3) {
    ;(sleeves[index]! >= centerX ? plusX : minusX).push(sleeves[index]!, sleeves[index + 1]!, sleeves[index + 2]!)
  }

  const bodyGrid = gridOf({ positions: body, cell: SEAM_GAP })
  const plusFrame = plusX.length > 0 ? measureSleeve({ sleeve: plusX, bodyGrid, body }) : null
  const minusFrame = minusX.length > 0 ? measureSleeve({ sleeve: minusX, bodyGrid, body }) : null

  // The armpit is the lowest point of either armhole seam.
  let armpitY = bounds({ positions: body, axis: 1 }).max

  for (const frame of [plusFrame, minusFrame]) {
    if (frame) {
      armpitY = Math.min(armpitY, bounds({ positions: frame.seam, axis: 1 }).min)
    }
  }

  const collarPoints = parts.filter((part) => part.part === 'collar').flatMap((part) => Array.from(part.positions))
  let collar: ShapeFrame['collar'] = null

  if (collarPoints.length > 0) {
    const x = bounds({ positions: collarPoints, axis: 0 })
    const z = bounds({ positions: collarPoints, axis: 2 })
    collar = {
      bottomY: bounds({ positions: collarPoints, axis: 1 }).min,
      halfWidth: Math.max(Math.abs(x.max - centerX), Math.abs(x.min - centerX)),
      centerZ: (z.min + z.max) / 2,
    }
  }

  return { centerX, hemY, armpitY, sleeves: { plusX: plusFrame, minusX: minusFrame }, collar }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** The displaced copy of `positions` (flat xyz, garment space). */
export function deformPositions({
  positions,
  part,
  shape,
  frame,
}: {
  positions: ArrayLike<number>
  part: ShapePart
  shape: GarmentShape
  frame: ShapeFrame
}): Float32Array {
  const out = Float32Array.from(positions)

  if (isNeutralShape({ shape })) {
    return out
  }

  const { centerX, hemY, armpitY, collar } = frame
  const drop = (armpitY - hemY) * shape.bodyLength
  const neckDrop = NECK_DROP * shape.necklineDepth

  for (let index = 0; index < out.length; index += 3) {
    const x = positions[index]!
    const y = positions[index + 1]!
    const z = positions[index + 2]!
    let [dx, dy, dz] = [0, 0, 0]

    if (part === 'sleeves') {
      const plus = x >= centerX
      const sleeve = plus ? frame.sleeves.plusX : frame.sleeves.minusX
      const amount = plus ? shape.leftSleeveLength : shape.rightSleeveLength

      if (sleeve && amount !== 0) {
        const weight = seamDistance({ seam: sleeve.seam, x, y, z }) / sleeve.reach
        const along = weight * amount * sleeve.reach
        dx += sleeve.axis[0] * along
        dy += sleeve.axis[1] * along
        dz += sleeve.axis[2] * along
      }
    }

    if (part === 'body') {
      if (drop !== 0 && y < armpitY) {
        dy -= clamp01((armpitY - y) / (armpitY - hemY)) * drop
      }

      if (shape.bodyWidth !== 0 && y < armpitY) {
        dx += (x - centerX) * shape.bodyWidth * smoothstep(0, WIDTH_EASE, armpitY - y)
      }
    }

    if (neckDrop !== 0 && collar && (part === 'body' || part === 'collar')) {
      const across = Math.min(1, Math.abs(x - centerX) / collar.halfWidth)
      const profile = Math.cos((across * Math.PI) / 2) ** 2
      const front = smoothstep(collar.centerZ - 0.01, collar.centerZ + 0.05, z)
      const down = part === 'collar' ? 1 : clamp01(1 - (collar.bottomY - y) / NECK_FADE)
      dy -= neckDrop * profile * front * down
    }

    out[index] = x + dx
    out[index + 1] = y + dy
    out[index + 2] = z + dz
  }

  return out
}

/** A mesh's positions moved into garment space. */
export function garmentSpacePositions({ geometry, toGarment }: { geometry: BufferGeometry; toGarment: Matrix4 }) {
  const position = geometry.getAttribute('position')
  const out = new Float32Array(position.count * 3)
  const point = new Vector3()

  for (let at = 0; at < position.count; at += 1) {
    point.fromBufferAttribute(position, at).applyMatrix4(toGarment)
    out[at * 3] = point.x
    out[at * 3 + 1] = point.y
    out[at * 3 + 2] = point.z
  }

  return out
}

/**
 * `geometry` with its vertices displaced by `shape`. `toGarment` takes the
 * mesh's local space to garment space. The result is a copy with only
 * `position` changed (UVs, normals and index as they were), so counts
 * never change; a neutral shape returns `geometry` itself.
 */
export function deformGeometry({
  geometry,
  toGarment,
  part,
  shape,
  frame,
}: {
  geometry: BufferGeometry
  toGarment: Matrix4
  part: ShapePart
  shape: GarmentShape
  frame: ShapeFrame
}): BufferGeometry {
  if (isNeutralShape({ shape })) {
    return geometry
  }

  const moved = deformPositions({
    positions: garmentSpacePositions({ geometry, toGarment }),
    part,
    shape,
    frame,
  })
  const back = new Matrix4().copy(toGarment).invert()
  const point = new Vector3()

  for (let index = 0; index < moved.length; index += 3) {
    point.set(moved[index]!, moved[index + 1]!, moved[index + 2]!).applyMatrix4(back)
    moved[index] = point.x
    moved[index + 1] = point.y
    moved[index + 2] = point.z
  }

  const out = geometry.clone()
  out.setAttribute('position', new BufferAttribute(moved, 3))
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

type RigMesh = { name: string; geometry: BufferGeometry; matrixWorld: Matrix4 }

/** The shape map's part for a mesh, by its own name or an ancestor's. */
function partOf({ names, parts }: { names: string[]; parts: Record<string, ShapePart> }) {
  for (const name of names) {
    if (parts[name]) {
      return parts[name]
    }
  }

  return null
}

/**
 * Shape a loaded model's meshes in place. Captures each mesh's original
 * geometry and its matrix into garment space (the model root's space) when
 * made, so call it before the scene graph is taken apart. `apply` swaps in
 * deformed copies (or the originals when neutral) and frees the last ones.
 */
export function createShapeRig<M extends RigMesh>({
  root,
  meshes,
  parts = TEE_V4_SHAPE_PARTS,
}: {
  root: { matrixWorld: Matrix4; updateMatrixWorld: (force?: boolean) => void }
  meshes: (M & { parent?: { name: string; parent?: unknown } | null })[]
  parts?: Record<string, ShapePart>
}) {
  root.updateMatrixWorld(true)
  const fromRoot = new Matrix4().copy(root.matrixWorld).invert()
  const rigged = meshes.flatMap((mesh) => {
    const names = [mesh.name]
    let parent = mesh.parent as { name: string; parent?: unknown } | null | undefined

    while (parent) {
      names.push(parent.name)
      parent = parent.parent as typeof parent
    }

    const part = partOf({ names, parts })
    return part
      ? [{ mesh, part, original: mesh.geometry, toGarment: new Matrix4().multiplyMatrices(fromRoot, mesh.matrixWorld) }]
      : []
  })
  let frame: ShapeFrame | null | undefined
  let current: GarmentShape | null = null

  return {
    /** How many meshes the shape reaches; 0 means `apply` does nothing. */
    size: rigged.length,
    apply({ shape }: { shape?: GarmentShape | null }) {
      const next = shape && !isNeutralShape({ shape }) ? shape : null

      if (JSON.stringify(next) === JSON.stringify(current)) {
        return false
      }

      current = next

      if (next && frame === undefined) {
        frame = measureShapeFrame({
          parts: rigged.map(({ part, original, toGarment }) => ({
            part,
            positions: garmentSpacePositions({ geometry: original, toGarment }),
          })),
        })
      }

      for (const entry of rigged) {
        const previous = entry.mesh.geometry
        entry.mesh.geometry =
          next && frame
            ? deformGeometry({ geometry: entry.original, toGarment: entry.toGarment, part: entry.part, shape: next, frame })
            : entry.original

        if (previous !== entry.original && previous !== entry.mesh.geometry) {
          previous.dispose()
        }
      }

      return true
    },
    dispose() {
      current = null

      for (const entry of rigged) {
        if (entry.mesh.geometry !== entry.original) {
          entry.mesh.geometry.dispose()
          entry.mesh.geometry = entry.original
        }
      }
    },
  }
}
