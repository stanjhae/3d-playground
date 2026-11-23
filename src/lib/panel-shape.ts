import { ShapeUtils, Vector2, type Mesh, type Object3D } from 'three'
import { create } from 'zustand'

import type { DesignDocument, PanelId } from './design-document'

type UvRect = { u0: number; v0: number; u1: number; v1: number }

/**
 * The triangles that print on one panel, in that panel's coordinates
 * (x left→right, y hem→top, 0–1), from a mesh's print UVs (`uv1`).
 * A triangle counts when all three corners sit inside the panel's atlas
 * rectangle; unprinted vertices sit at (−1, −1) and never do.
 * Flat [x0, y0, x1, y1, x2, y2, …].
 */
export function panelTriangles({
  uvs,
  index,
  rect,
}: {
  uvs: ArrayLike<number>
  index: ArrayLike<number> | null
  rect: UvRect
}): number[] {
  const width = rect.u1 - rect.u0
  const height = rect.v1 - rect.v0
  const count = index ? index.length : uvs.length / 2
  const out: number[] = []

  if (width <= 0 || height <= 0) {
    return out
  }

  for (let corner = 0; corner + 2 < count; corner += 3) {
    const triangle: number[] = []

    for (let k = 0; k < 3; k += 1) {
      const vertex = index ? index[corner + k]! : corner + k
      const u = uvs[vertex * 2]!
      const v = uvs[vertex * 2 + 1]!

      if (u < rect.u0 || u > rect.u1 || v < rect.v0 || v > rect.v1) {
        break
      }

      triangle.push((u - rect.u0) / width, (v - rect.v0) / height)
    }

    if (triangle.length === 6) {
      out.push(...triangle)
    }
  }

  return out
}

/**
 * Each panel's printable shape for the model in the scene, so the flat
 * sides can show where a design will and won't land (tester feedback:
 * "visualise the actual shape of the design surface").
 */
export const usePanelShapes = create<{
  src: string | null
  shapes: Partial<Record<PanelId, number[]>>
  setShapes: ({ src, shapes }: { src: string; shapes: Partial<Record<PanelId, number[]>> }) => void
}>()((set) => ({
  src: null,
  shapes: {},
  setShapes: ({ src, shapes }) => set({ src, shapes }),
}))

const masks = new Map<string, HTMLCanvasElement>()

/**
 * A veil over everything outside the panel's printable shape, at the
 * panel canvas's size; cached per model, panel and size.
 */
export function outsideVeil({
  src,
  panel,
  triangles,
  width,
  height,
}: {
  src: string
  panel: PanelId
  triangles: number[]
  width: number
  height: number
}): HTMLCanvasElement | null {
  const key = `${src}|${panel}|${width}x${height}`
  const cached = masks.get(key)

  if (cached) {
    return cached
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context || triangles.length === 0) {
    return null
  }

  context.fillStyle = 'rgba(26, 28, 34, 0.18)'
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = '#000'
  context.beginPath()

  for (let i = 0; i + 5 < triangles.length; i += 6) {
    context.moveTo(triangles[i]! * width, (1 - triangles[i + 1]!) * height)
    context.lineTo(triangles[i + 2]! * width, (1 - triangles[i + 3]!) * height)
    context.lineTo(triangles[i + 4]! * width, (1 - triangles[i + 5]!) * height)
    context.closePath()
  }

  context.fill()
  // A hairline round the gaps keeps slivers between triangles from showing.
  context.lineWidth = 1
  context.strokeStyle = '#000'
  context.stroke()
  masks.set(key, canvas)
  return canvas
}

const outlines = new Map<string, HTMLCanvasElement>()

function shapeMask({ triangles, width, height }: { triangles: number[]; width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  context.fillStyle = '#000'
  context.beginPath()

  for (let i = 0; i + 5 < triangles.length; i += 6) {
    context.moveTo(triangles[i]! * width, (1 - triangles[i + 1]!) * height)
    context.lineTo(triangles[i + 2]! * width, (1 - triangles[i + 3]!) * height)
    context.lineTo(triangles[i + 4]! * width, (1 - triangles[i + 5]!) * height)
    context.closePath()
  }

  context.fill()
  // As in the veil: the hairline closes slivers between triangles.
  context.lineWidth = 1
  context.strokeStyle = '#000'
  context.stroke()
  return canvas
}

/** The `lineWidth` offsets a ring is grown by: eight directions and the centre. */
export function ringOffsets({ lineWidth }: { lineWidth: number }) {
  const offsets: [number, number][] = [[0, 0]]

  for (let step = 0; step < 8; step += 1) {
    const angle = (step / 8) * Math.PI * 2
    // `+ 0` turns a rounded -0 into 0.
    offsets.push([Math.round(Math.cos(angle) * lineWidth) + 0, Math.round(Math.sin(angle) * lineWidth) + 0])
  }

  return offsets
}

/**
 * The panel's silhouette as a line just inside its printable shape, at the
 * panel canvas's size; cached per model, panel, size, colour and width.
 * The edge of the canvas counts as outside, so a side that fills its
 * rectangle is still outlined all round. Studio chrome only: published
 * art never sees it.
 */
export function panelOutline({
  src,
  panel,
  triangles,
  width,
  height,
  color,
  lineWidth,
}: {
  src: string
  panel: PanelId
  triangles: number[]
  width: number
  height: number
  color: string
  lineWidth: number
}): HTMLCanvasElement | null {
  const key = `${src}|${panel}|${width}x${height}|${color}|${lineWidth}`
  const cached = outlines.get(key)

  if (cached) {
    return cached
  }

  if (triangles.length === 0) {
    return null
  }

  const shape = shapeMask({ triangles, width, height })
  const outside = document.createElement('canvas')
  const grown = document.createElement('canvas')
  const ring = document.createElement('canvas')

  for (const canvas of [outside, grown, ring]) {
    canvas.width = width
    canvas.height = height
  }

  const outsideContext = outside.getContext('2d')
  const grownContext = grown.getContext('2d')
  const ringContext = ring.getContext('2d')

  if (!shape || !outsideContext || !grownContext || !ringContext) {
    return null
  }

  // Everything off the shape…
  outsideContext.fillStyle = '#000'
  outsideContext.fillRect(0, 0, width, height)
  outsideContext.globalCompositeOperation = 'destination-out'
  outsideContext.drawImage(shape, 0, 0)

  // …grown by the line's width, with the canvas edge counted as off it…
  for (const [dx, dy] of ringOffsets({ lineWidth })) {
    grownContext.drawImage(outside, dx, dy)
  }

  grownContext.strokeStyle = '#000'
  grownContext.lineWidth = lineWidth * 2
  grownContext.strokeRect(0, 0, width, height)

  // …where it overlaps the shape is the line.
  ringContext.drawImage(shape, 0, 0)
  ringContext.globalCompositeOperation = 'destination-in'
  ringContext.drawImage(grown, 0, 0)
  ringContext.globalCompositeOperation = 'source-in'
  ringContext.fillStyle = color
  ringContext.fillRect(0, 0, width, height)
  outlines.set(key, ring)
  return ring
}

/** Every panel's printable triangles in a loaded model, from its print UVs. */
export function shapesFromScene({
  scene,
  panelUv,
}: {
  scene: Object3D
  panelUv: NonNullable<DesignDocument['panelUv']>
}): Partial<Record<PanelId, number[]>> {
  const shapes: Partial<Record<PanelId, number[]>> = {}

  scene.traverse((object) => {
    const mesh = object as Mesh

    if (!mesh.isMesh || mesh.userData.printable === false) {
      return
    }

    const uv1 = mesh.geometry.getAttribute('uv1')

    if (!uv1) {
      return
    }

    const index = mesh.geometry.getIndex()

    for (const [panel, rect] of Object.entries(panelUv) as [PanelId, UvRect][]) {
      const triangles = panelTriangles({ uvs: uv1.array, index: index ? index.array : null, rect })

      if (triangles.length > 0) {
        shapes[panel] = [...(shapes[panel] ?? []), ...triangles]
      }
    }
  })

  // Front and back are symmetrical pieces. The two sleeves are one piece
  // mirrored, so they share one outline, the right's flipped across.
  const { left, right } = shapes

  for (const panel of Object.keys(shapes) as PanelId[]) {
    if ((panel === 'left' || panel === 'right') && left && right) {
      continue
    }

    shapes[panel] = cleanPanelShape({ triangles: shapes[panel]!, symmetric: panel === 'front' || panel === 'back' })
  }

  if (left && right) {
    Object.assign(shapes, cleanSleevePair({ left, right }))
  }

  return shapes
}

// --- Clean outlines ------------------------------------------------------------

const GRID = 96

/** Fills a GRID × GRID mask (row 0 at the hem) from panel-space triangles. */
function rasterise(triangles: readonly number[]): Float32Array {
  const mask = new Float32Array(GRID * GRID)

  for (let t = 0; t + 5 < triangles.length; t += 6) {
    const [ax, ay, bx, by, cx, cy] = triangles.slice(t, t + 6) as [number, number, number, number, number, number]
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx) * GRID))
    const maxX = Math.min(GRID - 1, Math.ceil(Math.max(ax, bx, cx) * GRID))
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy) * GRID))
    const maxY = Math.min(GRID - 1, Math.ceil(Math.max(ay, by, cy) * GRID))
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    if (Math.abs(area) < 1e-12) {
      continue
    }

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = (x + 0.5) / GRID
        const py = (y + 0.5) / GRID
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area
        const w2 = 1 - w0 - w1

        if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) {
          mask[y * GRID + x] = 1
        }
      }
    }
  }

  return mask
}

function blur(mask: Float32Array): Float32Array {
  const out = new Float32Array(mask.length)

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      let sum = 0
      let count = 0

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy

          if (nx >= 0 && ny >= 0 && nx < GRID && ny < GRID) {
            sum += mask[ny * GRID + nx]!
            count += 1
          }
        }
      }

      out[y * GRID + x] = sum / count
    }
  }

  return out
}

type Pt = [number, number]

/** Closed outlines of the mask at level 0.5 (marching squares), in panel space. */
function contours(mask: Float32Array): Pt[][] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? 0 : mask[y * GRID + x]!)
  const key = (p: Pt) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`
  const next = new Map<string, Pt>()
  // Just off 0.5: mirroring makes many samples exactly 0.5, and an outline
  // point landing on a sample would be shared by four cells and break the chain.
  const level = 0.4987
  const lerp = (a: number, b: number) => (level - a) / (b - a || 1e-9)

  // Cells span sample centres; a one-cell border closes every outline.
  for (let y = -1; y < GRID; y += 1) {
    for (let x = -1; x < GRID; x += 1) {
      const v0 = at(x, y)
      const v1 = at(x + 1, y)
      const v2 = at(x + 1, y + 1)
      const v3 = at(x, y + 1)
      const code = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0)

      if (code === 0 || code === 15) {
        continue
      }

      const sx = (x + 0.5) / GRID
      const sy = (y + 0.5) / GRID
      const s = 1 / GRID
      const bottom: Pt = [sx + lerp(v0, v1) * s, sy]
      const right: Pt = [sx + s, sy + lerp(v1, v2) * s]
      const top: Pt = [sx + lerp(v3, v2) * s, sy + s]
      const left: Pt = [sx, sy + lerp(v0, v3) * s]
      // Segments run with the inside on their right.
      const segments: [Pt, Pt][] = (
        {
          1: [[left, bottom]],
          2: [[bottom, right]],
          3: [[left, right]],
          4: [[right, top]],
          5: [[left, top], [right, bottom]],
          6: [[bottom, top]],
          7: [[left, top]],
          8: [[top, left]],
          9: [[top, bottom]],
          10: [[top, right], [bottom, left]],
          11: [[top, right]],
          12: [[right, left]],
          13: [[right, bottom]],
          14: [[bottom, left]],
        } as Record<number, [Pt, Pt][]>
      )[code]!

      for (const [from, to] of segments) {
        next.set(key(from), to)
      }
    }
  }

  const loops: Pt[][] = []
  const seen = new Set<string>()

  for (const [startKey, firstTo] of next) {
    if (seen.has(startKey)) {
      continue
    }

    const loop: Pt[] = []
    let current: Pt | undefined = firstTo
    seen.add(startKey)
    loop.push(startKey.split(',').map(Number) as Pt)

    while (current) {
      const k = key(current)

      if (k === startKey || seen.has(k)) {
        break
      }

      seen.add(k)
      loop.push(current)
      current = next.get(k)
    }

    if (loop.length > 2) {
      loops.push(loop)
    }
  }

  return loops
}

function area(loop: readonly Pt[]) {
  let sum = 0

  for (let i = 0; i < loop.length; i += 1) {
    const [x0, y0] = loop[i]!
    const [x1, y1] = loop[(i + 1) % loop.length]!
    sum += x0 * y1 - x1 * y0
  }

  return sum / 2
}

/** Ramer–Douglas–Peucker on a closed loop. */
function simplify(loop: Pt[], epsilon: number): Pt[] {
  const reduce = (points: Pt[]): Pt[] => {
    if (points.length < 3) {
      return points
    }

    const [ax, ay] = points[0]!
    const [bx, by] = points[points.length - 1]!
    const length = Math.hypot(bx - ax, by - ay) || 1e-9
    let worst = 0
    let index = 0

    for (let i = 1; i < points.length - 1; i += 1) {
      const [px, py] = points[i]!
      const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length

      if (distance > worst) {
        worst = distance
        index = i
      }
    }

    return worst > epsilon ? [...reduce(points.slice(0, index + 1)).slice(0, -1), ...reduce(points.slice(index))] : [points[0]!, points[points.length - 1]!]
  }

  const half = Math.floor(loop.length / 2)
  const first = reduce(loop.slice(0, half + 1))
  const second = reduce([...loop.slice(half), loop[0]!])
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

/** Chaikin corner cutting: a few passes round off the steps. */
function smooth(loop: Pt[], passes: number): Pt[] {
  let points = loop

  for (let pass = 0; pass < passes; pass += 1) {
    const out: Pt[] = []

    for (let i = 0; i < points.length; i += 1) {
      const [x0, y0] = points[i]!
      const [x1, y1] = points[(i + 1) % points.length]!
      out.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }

    points = out
  }

  return points
}

/**
 * A panel's printable shape as a clean outline: the mesh's print triangles
 * follow the 3D tee's folds, so their edge is ragged. Rasterised, softened,
 * mirrored about the centre line for a front or back (`symmetric`), traced,
 * simplified and rounded, then handed back as triangles in the same form,
 * so the veil and the tab icons draw it unchanged (founder review, 16 Nov).
 */
export function cleanPanelShape({ triangles, symmetric }: { triangles: readonly number[]; symmetric: boolean }): number[] {
  if (triangles.length < 6) {
    return [...triangles]
  }

  let mask = blur(blur(rasterise(triangles)))

  if (symmetric) {
    mask = mirroredAverage(mask)
  }

  return outline({ mask, fallback: triangles })
}

/** The mask averaged with its own mirror image, about the centre line. */
function mirroredAverage(mask: Float32Array) {
  const out = new Float32Array(mask.length)

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      out[y * GRID + x] = (mask[y * GRID + x]! + mask[y * GRID + (GRID - 1 - x)]!) / 2
    }
  }

  return out
}

/** Flips panel-space triangles across: x → 1 − x. */
function flipAcross(triangles: readonly number[]) {
  return triangles.map((value, index) => (index % 2 === 0 ? 1 - value : value))
}

/**
 * The two sleeves' outlines as one: a sleeve is one pattern piece cut
 * twice, mirrored, and the right sleeve's panel runs the other way round
 * the arm, so its shape is the left's flipped across. The 3D model's two
 * sleeves hang a little differently, so their traced edges never quite
 * agree; averaging the left's mask with the right's, flipped, gives one
 * smooth outline drawn the same on both tabs (founder, round 2: "the flat
 * templates look uneven").
 */
export function cleanSleevePair({ left, right }: { left: readonly number[]; right: readonly number[] }): { left: number[]; right: number[] } {
  if (left.length < 6 || right.length < 6) {
    return { left: cleanPanelShape({ triangles: left, symmetric: false }), right: cleanPanelShape({ triangles: right, symmetric: false }) }
  }

  const a = blur(blur(rasterise(left)))
  const b = blur(blur(rasterise(flipAcross(right))))
  const shared = outline({ mask: a.map((value, index) => (value + b[index]!) / 2), fallback: left })
  return { left: shared, right: flipAcross(shared) }
}

/**
 * A mask's outer outlines, simplified, counter-clockwise: the largest, and
 * any other piece of real size on the same panel (a dress's bodice above its
 * skirt); specks from stray triangles stay out.
 */
function outerLoops({ mask }: { mask: Float32Array }): Pt[][] {
  // Traced with the inside on the right, outer outlines run clockwise
  // (negative area) and holes counter-clockwise.
  const outers = contours(mask)
    .filter((loop) => area(loop) < 0)
    .sort((a, b) => area(a) - area(b))
  const largest = outers[0]

  if (!largest) {
    return []
  }

  return outers.filter((loop) => area(loop) <= area(largest) * 0.1).map((outer) => simplify([...outer].reverse(), 0.004))
}

/** A mask's outline, simplified and rounded, as triangles; `fallback` when nothing of size is traced. */
function outline({ mask, fallback }: { mask: Float32Array; fallback: readonly number[] }): number[] {
  const out: number[] = []

  for (const loop of outerLoops({ mask })) {
    const clean = smooth(loop, 3)
    const contour = clean.map(([x, y]) => new Vector2(x, y))
    const faces = ShapeUtils.triangulateShape(contour, [])

    for (const [a, b, c] of faces) {
      for (const vertex of [a!, b!, c!]) {
        out.push(clean[vertex]![0], clean[vertex]![1])
      }
    }
  }

  return out.length > 0 ? out : [...fallback]
}

/**
 * A front or back panel's clean outline as polygons (flat [x0, y0, x1, y1,
 * …] in panel space, y up), traced as `cleanPanelShape` traces it but not
 * yet rounded: a few dozen points, small enough to keep per template for a
 * My Studio card (`front-outlines.gen.ts`). Empty when nothing of size prints.
 */
export function panelOutlinePolygons({ triangles, symmetric }: { triangles: readonly number[]; symmetric: boolean }): number[][] {
  if (triangles.length < 6) {
    return []
  }

  let mask = blur(blur(rasterise(triangles)))

  if (symmetric) {
    mask = mirroredAverage(mask)
  }

  return outerLoops({ mask }).map((loop) => loop.flat())
}
