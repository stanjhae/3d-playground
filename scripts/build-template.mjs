// Turn a seated garment GLB into a print template (real models everywhere).
//
// Style3D-style garments are sewn from pattern pieces whose own UVs drive
// the fabric texture. Printing needs something else: each print panel
// (front, back, a sleeve, the hood...) laid upright and unmirrored in its
// own rectangle of a print atlas, the way the tee is. This script bakes
// that as a second UV set (TEXCOORD_1, "print UVs"), leaving the fabric
// UVs alone, and writes the template manifest the app pins designs to.
//
// - Each panel is a view (front, back, left, right: the wearer's sides)
//   and a list of pieces: a mesh node, or its largest connected piece.
// - A triangle prints when it belongs to a panel's pieces and faces that
//   panel's viewer; its print UVs are a planar projection seen from there,
//   so a mark reads the right way round from where you look at it. The
//   inner layer of a two-sided shell faces away and never prints.
// - A sleeve panel may wrap (`"wrap": true`): instead of a flat view from
//   the side, its print area is the whole sleeve unrolled around its own
//   axis, seam on the inner side against the body, so filling the sleeve
//   covers it all round (founder review, 16 Nov). Only the outer layer
//   prints. Near the outer face it maps as the flat view did.
// - Panels are packed into the atlas at one shared scale, so a mark of the
//   same size reads the same size on every panel.
// - Every other vertex gets print UVs of (-1, -1), which the ink shader
//   leaves unprinted. Vertices shared by printed and unprinted triangles
//   are split so no triangle smears ink across the atlas.
//
//   node scripts/build-template.mjs --pieces templates/hoodie.pieces.json
//   node scripts/build-template.mjs --inspect public/models/hoodie.glb
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

import { atlasRects, packPanels, round } from './atlas-pack.mjs'

/** A triangle prints when its normal faces the viewer at least this much. */
const FACING_MIN = 0.2
const UNPRINTED = -1

/** Viewer axes per view: print x = world · right, print y = world y. */
const VIEW_RIGHT = {
  // From the front, the wearer's left (+x) is on the viewer's right.
  front: [1, 0, 0],
  // From behind, the wearer's right (−x) is on the viewer's right.
  back: [-1, 0, 0],
  // From the wearer's left (+x), looking in: the front (+z) is on the left.
  left: [0, 0, -1],
  // From the wearer's right (−x): the front is on the right.
  right: [0, 0, 1],
}
const VIEW_TOWARD = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
}

/**
 * Sleeve panels route like the tee's (`template-manifest.ts`): canonical ids
 * name the wearer's side, render ids the camera's, where render `left` is
 * the wearer's right. The editor tabs, camera presets and published side
 * views all speak render ids, so every garment means the same by them.
 */
const RENDER_SIDE = { left: 'right', right: 'left' }

const { values } = parseArgs({
  options: {
    pieces: { type: 'string' },
    inspect: { type: 'string' },
  },
})

async function createIo() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    })
}

function transformPoint({ matrix: m, point: [x, y, z] }) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

/** World positions of a primitive's vertices. */
function worldPositions({ primitive, matrix }) {
  const position = primitive.getAttribute('POSITION')
  const count = position.getCount()
  const out = new Float64Array(count * 3)
  const point = [0, 0, 0]

  for (let index = 0; index < count; index += 1) {
    position.getElement(index, point)
    out.set(transformPoint({ matrix, point }), index * 3)
  }

  return out
}

/** Connected pieces of a primitive, joining vertices at the same position. */
function pieceOfTriangle({ primitive }) {
  const position = primitive.getAttribute('POSITION')
  const indices = primitive.getIndices().getArray()
  const parent = Int32Array.from({ length: position.getCount() }, (_, index) => index)
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }
  const seen = new Map()
  const point = [0, 0, 0]

  for (let index = 0; index < position.getCount(); index += 1) {
    position.getElement(index, point)
    const key = point.map((value) => Math.round(value * 1e5)).join(',')
    if (seen.has(key)) union(index, seen.get(key))
    else seen.set(key, index)
  }

  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    union(indices[triangle], indices[triangle + 1])
    union(indices[triangle], indices[triangle + 2])
  }

  const pieces = new Int32Array(indices.length / 3)
  for (let triangle = 0; triangle < pieces.length; triangle += 1) {
    pieces[triangle] = find(indices[triangle * 3])
  }
  return pieces
}

function faceNormal({ world, a, b, c }) {
  const ux = world[b * 3] - world[a * 3]
  const uy = world[b * 3 + 1] - world[a * 3 + 1]
  const uz = world[b * 3 + 2] - world[a * 3 + 2]
  const vx = world[c * 3] - world[a * 3]
  const vy = world[c * 3 + 1] - world[a * 3 + 1]
  const vz = world[c * 3 + 2] - world[a * 3 + 2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz) || 1
  return [nx / length, ny / length, nz / length]
}

function meshNodes({ document }) {
  return document.getRoot().listNodes().filter((node) => node.getMesh())
}

async function inspect({ file }) {
  const io = await createIo()
  const document = await io.read(file)

  for (const node of meshNodes({ document })) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
      const pieces = pieceOfTriangle({ primitive })
      const indices = primitive.getIndices().getArray()
      const stats = new Map()

      for (let triangle = 0; triangle < pieces.length; triangle += 1) {
        const entry = stats.get(pieces[triangle]) ?? { triangles: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
        entry.triangles += 1
        for (const vertex of indices.slice(triangle * 3, triangle * 3 + 3)) {
          for (let axis = 0; axis < 3; axis += 1) {
            entry.min[axis] = Math.min(entry.min[axis], world[vertex * 3 + axis])
            entry.max[axis] = Math.max(entry.max[axis], world[vertex * 3 + axis])
          }
        }
        stats.set(pieces[triangle], entry)
      }

      const largest = [...stats.values()].sort((a, b) => b.triangles - a.triangles).slice(0, 4)
      console.log(`${node.getName()}: ${stats.size} piece(s)`)
      for (const piece of largest) {
        const box = [0, 1, 2].map((axis) => `${'xyz'[axis]}[${piece.min[axis].toFixed(2)}, ${piece.max[axis].toFixed(2)}]`).join(' ')
        console.log(`  ${piece.triangles} tris ${box}`)
      }
    }
  }
}

/**
 * Seat a raw download in the studio frame, once: scale to metres, turn the
 * front to face +z, and centre it on x and z (the floor stays at y = 0).
 * `rename` gives mesh nodes the panel names colour overrides match.
 * The seat is a parent node named `seat`, so a rebuild finds it and skips.
 */
function seatModel({ document, seat }) {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0]
  if (scene.listChildren().some((child) => child.getName() === 'seat')) return

  // Panel names the app's colour overrides match (`body`, `body-*`).
  for (const node of meshNodes({ document })) {
    const name = seat.rename?.[node.getName()]
    if (name) node.setName(name)
  }

  const seatNode = document.createNode('seat')
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    seatNode.addChild(child)
  }
  scene.addChild(seatNode)

  const half = ((seat.rotateY ?? 0) * Math.PI) / 360
  seatNode.setRotation([0, Math.sin(half), 0, Math.cos(half)])
  seatNode.setScale([seat.scale ?? 1, seat.scale ?? 1, seat.scale ?? 1])

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const node of meshNodes({ document })) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
      for (let index = 0; index < world.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], world[index + axis])
          max[axis] = Math.max(max[axis], world[index + axis])
        }
      }
    }
  }
  seatNode.setTranslation([-(min[0] + max[0]) / 2, 0, -(min[2] + max[2]) / 2])
}

/** Which connected piece a pick keeps: all, the largest, or the one furthest to ±x. */
function keptPiece({ pick, pieces, indices, world }) {
  if (pick.piece === 'largest') {
    const counts = new Map()
    for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  if (pick.piece === '+x' || pick.piece === '-x') {
    const sums = new Map()
    for (let triangle = 0; triangle < pieces.length; triangle += 1) {
      const entry = sums.get(pieces[triangle]) ?? { x: 0, count: 0 }
      entry.x += world[indices[triangle * 3] * 3]
      entry.count += 1
      sums.set(pieces[triangle], entry)
    }
    const sign = pick.piece === '+x' ? 1 : -1
    return [...sums.entries()].sort((a, b) => sign * (b[1].x / b[1].count - a[1].x / a[1].count))[0][0]
  }

  return null
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const norm = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return scale3(a, 1 / length)
}

/**
 * A sleeve's own frame for wrapping: its axis (the main direction of its
 * vertices, shoulder to cuff), the outer face's direction (`out`, toward the
 * panel's viewer) and the across direction (`across`, the viewer's right),
 * and its mean radius. `project` unrolls a point to (around, up the sleeve).
 */
function wrapFrame({ points, toward, right }) {
  const centre = [0, 0, 0]
  for (const point of points) for (let k = 0; k < 3; k += 1) centre[k] += point[k] / points.length

  // Principal axis by power iteration on the covariance.
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const point of points) {
    const d = sub(point, centre)
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) cov[i * 3 + j] += d[i] * d[j]
  }
  let axis = norm([toward[0] + 0.1, -1, toward[2] + 0.1])
  for (let iteration = 0; iteration < 64; iteration += 1) {
    axis = norm([0, 1, 2].map((i) => cov[i * 3] * axis[0] + cov[i * 3 + 1] * axis[1] + cov[i * 3 + 2] * axis[2]))
  }
  // Shoulder to cuff: away from the body's centre line, the side the viewer stands.
  if (dot(axis, toward) < 0) axis = scale3(axis, -1)

  const out = norm(sub(toward, scale3(axis, dot(toward, axis))))
  let across = sub(right, scale3(axis, dot(right, axis)))
  across = norm(sub(across, scale3(out, dot(across, out))))
  let radius = 0
  for (const point of points) {
    const d = sub(point, centre)
    const radial = sub(d, scale3(axis, dot(d, axis)))
    radius += Math.hypot(radial[0], radial[1], radial[2]) / points.length
  }

  return {
    radial: (point) => {
      const d = sub(point, centre)
      return norm(sub(d, scale3(axis, dot(d, axis))))
    },
    angle: (point) => {
      const d = sub(point, centre)
      return Math.atan2(dot(d, across), dot(d, out))
    },
    project: (point) => {
      const d = sub(point, centre)
      return [Math.atan2(dot(d, across), dot(d, out)) * radius, -dot(d, axis)]
    },
    /** Once round the sleeve, in print units. */
    girth: 2 * Math.PI * radius,
  }
}

/**
 * The torso's own frame for wrapping front and back (`"wrap": "torso"`,
 * tee @6): the body is unrolled around its vertical axis, so the sides
 * belong to the front and back panels and they meet at the side seams
 * instead of fading out where the cloth turns away from a flat view.
 *
 * Print x is the cloth's own arc length round the body, measured on the
 * mesh: in each 2 cm band the torso's outline is traced by angle (the
 * outermost vertex in each of 180 angle bins, so the inner layer and fine
 * wrinkles don't count), smoothed, and walked from the panel's centre line.
 * A centimetre of cloth is then a centimetre of print
 * at the sides. Across the middle (within 55° of the centre line) print x
 * is the flat view instead, blending into the arc by 88°: the tee's front
 * is rounded, and art there is seen from the front, so a square mark stays
 * square to the eye (an arc length all the way, or the fitted ellipse of
 * the first cut, squeezed it across the chest). Bands are blended up the
 * body, so the mapping has no steps.
 */
/** Torso wrap: flat (as seen) up to this angle from the centre line, arc length from the next. */
const FLAT_UNTIL = (55 * Math.PI) / 180
const ARC_FROM = (88 * Math.PI) / 180

function smoothstep({ from, to, value }) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

function torsoFrame({ points }) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, y, z] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const cy = (minY + maxY) / 2
  const band = 0.02
  const bands = Math.max(1, Math.ceil((maxY - minY) / band))
  const BINS = 180
  const binOf = (angle) => Math.min(BINS - 1, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * BINS))
  const angleOfBin = (bin) => -Math.PI + ((bin + 0.5) / BINS) * 2 * Math.PI
  const viewAngle = ([x, , z], { toward, right }) => {
    const dx = x - cx
    const dz = z - cz
    return Math.atan2(dx * right[0] + dz * right[2], dx * toward[0] + dz * toward[2])
  }

  /** Per band, the arc length from the view's centre line at each angle bin's centre. */
  const tables = new Map()
  const tableFor = (view) => {
    const key = `${view.toward}|${view.right}`
    if (tables.has(key)) return tables.get(key)

    // Outermost radius per band and angle bin.
    const radius = Array.from({ length: bands }, () => new Float64Array(BINS))
    for (const point of points) {
      const index = Math.min(bands - 1, Math.floor((point[1] - minY) / band))
      const bin = binOf(viewAngle(point, view))
      radius[index][bin] = Math.max(radius[index][bin], Math.hypot(point[0] - cx, point[2] - cz))
    }
    // Fill empty bins round the circle, then smooth along the angle and up the body.
    for (const ring of radius) {
      const known = [...ring.keys()].filter((bin) => ring[bin] > 0)
      if (!known.length) continue
      const copy = Float64Array.from(ring)
      for (let bin = 0; bin < BINS; bin += 1) {
        if (copy[bin] > 0) continue
        let before = known.findLast((k) => k < bin) ?? known.at(-1) - BINS
        let after = known.find((k) => k > bin) ?? known[0] + BINS
        const at = (k) => copy[((k % BINS) + BINS) % BINS]
        ring[bin] = at(before) + ((at(after) - at(before)) * (bin - before)) / (after - before)
      }
    }
    const smoothAngle = (ring) =>
      Float64Array.from(ring, (_, bin) => {
        let sum = 0
        for (let k = -2; k <= 2; k += 1) sum += ring[(bin + k + BINS) % BINS]
        return sum / 5
      })
    const rings = radius.map((ring) => (ring.some((value) => value > 0) ? smoothAngle(ring) : null))
    const smoothed = rings.map((_, index) => {
      const out = new Float64Array(BINS)
      let count = 0
      for (let k = Math.max(0, index - 1); k <= Math.min(bands - 1, index + 1); k += 1) {
        if (!rings[k]) continue
        for (let bin = 0; bin < BINS; bin += 1) out[bin] += rings[k][bin]
        count += 1
      }
      return count ? out.map((value) => value / count) : null
    })
    // Arc length along each band's outline, from angle 0, at each bin centre.
    const arcs = smoothed.map((ring) => {
      if (!ring) return null
      const xy = (bin) => [Math.sin(angleOfBin(bin)) * ring[bin], Math.cos(angleOfBin(bin)) * ring[bin]]
      const cumulative = new Float64Array(BINS)
      for (let bin = 1; bin < BINS; bin += 1) {
        const [x0, z0] = xy(bin - 1)
        const [x1, z1] = xy(bin)
        cumulative[bin] = cumulative[bin - 1] + Math.hypot(x1 - x0, z1 - z0)
      }
      // Measured from the centre line (angle 0 lies between the two middle bins).
      const zero = (cumulative[BINS / 2 - 1] + cumulative[BINS / 2]) / 2
      return cumulative.map((value) => value - zero)
    })
    // Bands with no cloth borrow their nearest neighbour's.
    for (let index = 0; index < bands; index += 1) {
      if (arcs[index]) continue
      let near = null
      for (let step = 1; step < bands && !near; step += 1) near = arcs[index - step] ?? arcs[index + step] ?? null
      arcs[index] = near
    }
    tables.set(key, arcs)
    return arcs
  }

  const arcAt = (arcs, bandIndex, angle) => {
    const position = ((angle + Math.PI) / (2 * Math.PI)) * BINS - 0.5
    const low = Math.max(0, Math.min(BINS - 2, Math.floor(position)))
    const t = position - low
    const table = arcs[bandIndex]
    return table[low] + (table[low + 1] - table[low]) * t
  }

  return {
    /** Toward the outside of the cloth here (flattened vertically, so shoulder tops count). */
    outward: ([x, y, z]) => norm([x - cx, (y - cy) * 0.5, z - cz]),
    /** Angle around the body from the view's centre line, positive toward the viewer's right. */
    angle: (point, view) => viewAngle(point, view),
    project: (point, view) => {
      const arcs = tableFor(view)
      const t = Math.min(bands - 1, Math.max(0, (point[1] - minY) / band - 0.5))
      const low = Math.floor(t)
      const high = Math.min(bands - 1, low + 1)
      const angle = viewAngle(point, view)
      const a = arcAt(arcs, low, angle)
      const b = arcAt(arcs, high, angle)
      const arc = a + (b - a) * (t - low)
      // Across the middle of the panel, the flat view: what faces you prints
      // as you see it, so a square mark looks square from the front. Toward
      // the sides it turns into the arc length, which reaches the seam.
      // Both grow with the angle and the arc is never shorter, so the blend
      // keeps print x in order.
      const flat = (point[0] - cx) * view.right[0] + (point[2] - cz) * view.right[2]
      const w = smoothstep({ from: FLAT_UNTIL, to: ARC_FROM, value: Math.abs(angle) })
      return [flat + (arc - flat) * w, point[1]]
    },
  }
}

/** The whole garment's extent, for the camera to fit. */
function garmentBounds({ document }) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const node of meshNodes({ document })) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
      for (let index = 0; index < world.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], world[index + axis])
          max[axis] = Math.max(max[axis], world[index + axis])
        }
      }
    }
  }
  return { min: min.map((value) => round({ value })), max: max.map((value) => round({ value })) }
}

function writeManifest({ spec, generator, source, sha256, bounds, regions }) {
  const manifest = {
    id: spec.templateId,
    version: spec.version,
    garmentId: spec.garmentId,
    orientation: 'wearer',
    geometry: {
      kind: 'glb',
      file: spec.file ?? spec.out.replace(/^public/, ''),
      sha256,
      generator,
      bounds,
    },
    atlas: { width: spec.atlas, height: spec.atlas },
    material: { color: spec.color ?? '#ffffff', roughness: 0.86, metalness: 0 },
    fonts: [
      { face: 'display', family: 'Cormorant Garamond', package: '@fontsource/cormorant-garamond', license: 'OFL-1.1' },
      { face: 'sans', family: 'Outfit', package: '@fontsource/outfit', license: 'OFL-1.1' },
    ],
    regions,
  }
  const constName = `${spec.templateId.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_V${spec.version}`
  writeFileSync(
    spec.manifest,
    `// Generated by ${generator.split(' ')[0]} from ${source}. Do not edit by hand.\nimport type { TemplateManifest } from '../template-manifest.ts'\n\nexport const ${constName}: TemplateManifest = ${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

/**
 * A GLB that already carries its print UVs (`"printUv": "keep"`, from
 * `scripts/bake-pattern-glb.mjs`): its TEXCOORD_1 lays each panel in the
 * spec's `uv` rectangle already, so this only checks that, measures each
 * panel's centre and the bounds, and writes the manifest. The GLB's bytes
 * are passed through as they are, so the sha256 pins exactly what was baked.
 */
async function buildKept({ piecesFile, spec }) {
  const io = await createIo()
  const document = await io.read(spec.glb)
  const sums = spec.panels.map(() => ({ x: 0, y: 0, z: 0, count: 0 }))
  const uv = [0, 0]
  const point = [0, 0, 0]

  for (const node of meshNodes({ document })) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const printUv = primitive.getAttribute('TEXCOORD_1')
      if (!printUv) throw new Error(`${node.getName()}: no print UVs (TEXCOORD_1)`)
      const matrix = node.getWorldMatrix()
      const position = primitive.getAttribute('POSITION')

      for (let index = 0; index < printUv.getCount(); index += 1) {
        printUv.getElement(index, uv)
        if (uv[0] < 0 && uv[1] < 0) continue
        if (uv[0] > 1 || uv[1] > 1 || uv[0] < 0 || uv[1] < 0) throw new Error(`${node.getName()}: print UV (${uv}) outside [0, 1]`)
        // Draco quantises UVs, so a vertex may sit a hair outside its rectangle.
        const panel = spec.panels.findIndex(({ uv: rect }) => uv[0] >= rect.u0 - 1e-3 && uv[0] <= rect.u1 + 1e-3 && uv[1] >= rect.v0 - 1e-3 && uv[1] <= rect.v1 + 1e-3)
        if (panel === -1) throw new Error(`${node.getName()}: print UV (${uv}) in no panel's rectangle`)
        position.getElement(index, point)
        const [x, y, z] = transformPoint({ matrix, point })
        const sum = sums[panel]
        sum.x += x
        sum.y += y
        sum.z += z
        sum.count += 1
      }
    }
  }

  writeFileSync(spec.out, readFileSync(spec.glb))
  const sha256 = createHash('sha256').update(readFileSync(spec.out)).digest('hex')
  const regions = Object.fromEntries(
    spec.panels.map((panel, index) => {
      const sum = sums[index]
      if (!sum.count) throw new Error(`Panel ${panel.id}: no vertex prints in its rectangle`)
      const { width, height } = panel.frame
      return [
        panel.id,
        {
          label: panel.label,
          renderPanel: RENDER_SIDE[panel.id] ?? panel.id,
          // The pattern frame of a back panel reads as if seen through the body.
          renderMirrorX: Boolean(panel.frame.mirrorX),
          mesh: panel.mesh,
          uv: panel.uv,
          axes: {
            x: panel.frame.mirrorX ? "toward the wearer's left (mirrored when seen from behind)" : `across the ${panel.label.toLowerCase()} as seen from outside`,
            y: 'up the garment',
          },
          landmarks: {},
          notes: [`Pattern frame ${(width / 10).toFixed(1)} × ${(height / 10).toFixed(1)} cm, from the ${spec.recipe} recipe.`],
          surface: { stretchY: 1, panelAspect: round({ value: width / height }) },
          center: [sum.x / sum.count, sum.y / sum.count, sum.z / sum.count].map((value) => round({ value })),
        },
      ]
    }),
  )
  writeManifest({ spec, generator: spec.generator ?? `scripts/build-template.mjs (${piecesFile})`, source: spec.source ?? piecesFile, sha256, bounds: garmentBounds({ document }), regions })
  console.log(JSON.stringify({ out: spec.out, manifest: spec.manifest, sha256 }, null, 2))
}

async function build({ piecesFile }) {
  const spec = JSON.parse(readFileSync(piecesFile, 'utf8'))
  if (spec.printUv === 'keep') return buildKept({ piecesFile, spec })
  const io = await createIo()
  const document = await io.read(spec.glb)
  if (spec.seat) seatModel({ document, seat: spec.seat })
  const nodes = new Map(meshNodes({ document }).map((node) => [node.getName(), node]))
  const facingMin = spec.facingMin ?? FACING_MIN
  const point = (world, vertex) => [world[vertex * 3], world[vertex * 3 + 1], world[vertex * 3 + 2]]
  /** Every triangle a panel's pieces keep, with its primitive's world positions. */
  const keptTriangles = function* ({ panel }) {
    for (const pick of panel.pieces) {
      const node = nodes.get(pick.node)
      if (!node) throw new Error(`Panel ${panel.id}: no mesh node ${pick.node}`)
      for (const primitive of node.getMesh().listPrimitives()) {
        const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
        const indices = primitive.getIndices().getArray()
        const pieces = pieceOfTriangle({ primitive })
        const keep = keptPiece({ pick, pieces, indices, world })
        for (let triangle = 0; triangle < pieces.length; triangle += 1) {
          if (keep !== null && pieces[triangle] !== keep) continue
          yield { world, vertices: indices.slice(triangle * 3, triangle * 3 + 3) }
        }
      }
    }
  }
  // Front and back wrapped round the torso share one frame, measured from both.
  const torsoPanels = spec.panels.filter((panel) => panel.wrap === 'torso')
  const torso = torsoPanels.length
    ? torsoFrame({
        points: torsoPanels.flatMap((panel) => [...keptTriangles({ panel })].flatMap(({ world, vertices }) => [...vertices].map((vertex) => point(world, vertex)))),
      })
    : null

  // 1. Which triangles print, on which panel, and where they project.
  const plans = []
  const boxes = []
  /** Per panel: a vertex's print position (planar, or unrolled for a wrapped sleeve). */
  const projectors = []
  /** Where each panel sits on the garment (the mean of its printed vertices), for the camera. */
  const centers = []

  for (const panel of spec.panels) {
    const right = VIEW_RIGHT[panel.view]
    const toward = VIEW_TOWARD[panel.view]
    if (!right) throw new Error(`Panel ${panel.id}: unknown view ${panel.view}`)
    if (RENDER_SIDE[panel.id] && panel.view !== panel.id) {
      throw new Error(`Panel ${panel.id}: the wearer's ${panel.id} sleeve is seen from the ${panel.id}, not the ${panel.view}`)
    }
    if (panel.renderPanel) throw new Error(`Panel ${panel.id}: renderPanel comes from the panel id, not the piece map`)
    const box ={ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    const sum = { x: 0, y: 0, z: 0, count: 0 }
    let frame = null
    const view = { toward, right }

    // A wrapped sleeve measures its own axis from all of its piece's vertices.
    if (panel.wrap === true) {
      const points = []
      for (const pick of panel.pieces) {
        const node = nodes.get(pick.node)
        if (!node) throw new Error(`Panel ${panel.id}: no mesh node ${pick.node}`)
        for (const primitive of node.getMesh().listPrimitives()) {
          const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
          const indices = primitive.getIndices().getArray()
          const pieces = pieceOfTriangle({ primitive })
          const keep = keptPiece({ pick, pieces, indices, world })
          for (let triangle = 0; triangle < pieces.length; triangle += 1) {
            if (keep !== null && pieces[triangle] !== keep) continue
            for (const vertex of indices.slice(triangle * 3, triangle * 3 + 3)) points.push(point(world, vertex))
          }
        }
      }
      frame = wrapFrame({ points, toward, right })
    }

    const flat = (world, vertex) => [world[vertex * 3] * right[0] + world[vertex * 3 + 1] * right[1] + world[vertex * 3 + 2] * right[2], world[vertex * 3 + 1]]
    // `shift`: a triangle across a wrapped sleeve's inner seam, unrolled past
    // the seam's far side (`"closeSleeveSeam"`), so the seam prints too.
    const project = panel.wrap === 'torso'
      ? (world, vertex) => torso.project(point(world, vertex), view)
      : frame
        ? (world, vertex, shift = false) => {
            const [px, py] = frame.project(point(world, vertex))
            return [shift && frame.angle(point(world, vertex)) < 0 ? px + frame.girth : px, py]
          }
        : flat
    projectors.push(project)

    for (const pick of panel.pieces) {
      const node = nodes.get(pick.node)
      if (!node) throw new Error(`Panel ${panel.id}: no mesh node ${pick.node}`)

      for (const primitive of node.getMesh().listPrimitives()) {
        const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
        const indices = primitive.getIndices().getArray()
        const pieces = pieceOfTriangle({ primitive })
        const keep = keptPiece({ pick, pieces, indices, world })

        const printed = new Uint8Array(pieces.length)
        const shifted = new Uint8Array(pieces.length)
        for (let triangle = 0; triangle < pieces.length; triangle += 1) {
          if (keep !== null && pieces[triangle] !== keep) continue
          const [a, b, c] = indices.slice(triangle * 3, triangle * 3 + 3)
          const normal = faceNormal({ world, a, b, c })
          const mid = [0, 1, 2].map((k) => (world[a * 3 + k] + world[b * 3 + k] + world[c * 3 + k]) / 3)

          if (panel.wrap === 'torso') {
            // The outer layer only: sides, shoulder tops and underarms print.
            if (dot(normal, torso.outward(mid)) < facingMin) continue
            const angles = [a, b, c].map((vertex) => torso.angle(point(world, vertex), view))
            if (Math.max(...angles) - Math.min(...angles) > Math.PI) continue
          } else if (frame) {
            // The outer layer only, and not a triangle the seam runs through
            // (unless the piece map closes the seam: then it unrolls past it).
            if (dot(normal, frame.radial(mid)) < facingMin) continue
            const angles = [a, b, c].map((vertex) => frame.angle(point(world, vertex)))
            if (Math.max(...angles) - Math.min(...angles) > Math.PI) {
              if (!spec.closeSleeveSeam) continue
              shifted[triangle] = 1
            }
          } else {
            const facing = normal[0] * toward[0] + normal[1] * toward[1] + normal[2] * toward[2]
            if (facing < facingMin) continue
          }

          printed[triangle] = 1

          for (const vertex of [a, b, c]) {
            const [px, py] = project(world, vertex, Boolean(shifted[triangle]))
            box.minX = Math.min(box.minX, px)
            box.maxX = Math.max(box.maxX, px)
            box.minY = Math.min(box.minY, py)
            box.maxY = Math.max(box.maxY, py)
            sum.x += world[vertex * 3]
            sum.y += world[vertex * 3 + 1]
            sum.z += world[vertex * 3 + 2]
            sum.count += 1
          }
        }

        plans.push({ panel, primitive, world, printed, shifted })
      }
    }

    if (!Number.isFinite(box.minX)) throw new Error(`Panel ${panel.id}: nothing faces the ${panel.view} view`)
    boxes.push({ ...box, width: box.maxX - box.minX, height: box.maxY - box.minY })
    centers.push([sum.x / sum.count, sum.y / sum.count, sum.z / sum.count].map((value) => round({ value })))
  }

  // 2. Pack panels at one shared scale.
  const size = spec.atlas
  const { scale, placed } = packPanels({ boxes, size, ...(spec.padding ? { padding: spec.padding } : {}) })
  const rects = atlasRects({ placed, size })

  // 3. Bake print UVs, splitting vertices shared across printed and unprinted triangles.
  const panelIndex = new Map(spec.panels.map((panel, index) => [panel.id, index]))
  const byPrimitive = new Map()
  for (const plan of plans) {
    const list = byPrimitive.get(plan.primitive) ?? []
    list.push(plan)
    byPrimitive.set(plan.primitive, list)
  }

  for (const node of nodes.values()) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const plansHere = byPrimitive.get(primitive) ?? []
      const indices = primitive.getIndices()
      const array = indices.getArray()
      const triangles = array.length / 3
      // Which panel (index) prints each triangle, or −1.
      const owner = new Int32Array(triangles).fill(-1)
      const shift = new Uint8Array(triangles)
      for (const plan of plansHere) {
        for (let triangle = 0; triangle < triangles; triangle += 1) {
          if (plan.printed[triangle] && owner[triangle] === -1) {
            owner[triangle] = panelIndex.get(plan.panel.id)
            shift[triangle] = plan.shifted[triangle]
          }
        }
      }

      // A rebuild replaces earlier print UVs rather than carrying them along.
      const previous = primitive.getAttribute('TEXCOORD_1')
      if (previous) {
        primitive.setAttribute('TEXCOORD_1', null)
        if (previous.listParents().length <= 1) previous.dispose()
      }

      const semantics = primitive.listSemantics()
      const attributes = semantics.map((semantic) => primitive.getAttribute(semantic))
      const sources = attributes.map((attribute) => ({
        attribute,
        size: attribute.getElementSize(),
        array: attribute.getArray(),
      }))
      const world = plansHere[0]?.world ?? worldPositions({ primitive, matrix: node.getWorldMatrix() })
      const out = sources.map(() => [])
      const printUv = []
      const remap = new Map()
      const nextIndices = new Uint32Array(array.length)

      for (let triangle = 0; triangle < triangles; triangle += 1) {
        const panel = owner[triangle]
        for (let corner = 0; corner < 3; corner += 1) {
          const vertex = array[triangle * 3 + corner]
          const key = shift[triangle] ? `${vertex}:${panel}:shifted` : `${vertex}:${panel}`
          let index = remap.get(key)

          if (index === undefined) {
            index = printUv.length / 2
            remap.set(key, index)
            sources.forEach((source, which) => {
              for (let k = 0; k < source.size; k += 1) out[which].push(source.array[vertex * source.size + k])
            })

            if (panel === -1) {
              printUv.push(UNPRINTED, UNPRINTED)
            } else {
              const box = boxes[panel]
              const rect = rects[panel]
              const [px, py] = projectors[panel](world, vertex, Boolean(shift[triangle]))
              printUv.push(
                rect.u0 + ((px - box.minX) / (box.width || 1)) * (rect.u1 - rect.u0),
                rect.v0 + ((py - box.minY) / (box.height || 1)) * (rect.v1 - rect.v0),
              )
            }
          }
          nextIndices[triangle * 3 + corner] = index
        }
      }

      sources.forEach((source, which) => {
        const Typed = source.array.constructor
        source.attribute.setArray(new Typed(out[which]))
      })
      indices.setArray(nextIndices)
      const buffer = attributes[0].getBuffer()
      primitive.setAttribute(
        'TEXCOORD_1',
        document.createAccessor().setType('VEC2').setArray(new Float32Array(printUv)).setBuffer(buffer),
      )
    }
  }

  const bounds = garmentBounds({ document })
  await io.write(spec.out, document)
  const sha256 = createHash('sha256').update(readFileSync(spec.out)).digest('hex')

  // 4. The manifest the app pins designs to.
  // Each panel's place in the garment's print space (metres; canonical x
  // toward the wearer's left, y up). A back wrapped round the torso spans
  // the same seam-to-seam width as the front, so a pattern phased from the
  // origin meets itself at both side seams (its own arc is a little shorter).
  const front = spec.panels.findIndex((panel) => panel.view === 'front' && panel.wrap === 'torso')
  const printFrame = ({ index }) => {
    const panel = spec.panels[index]
    const box = boxes[index]
    const y = { y0: round({ value: box.minY }), y1: round({ value: box.maxY }) }
    if (panel.view === 'back' && panel.wrap === 'torso' && front !== -1) {
      return { x0: round({ value: boxes[front].minX }), x1: round({ value: boxes[front].maxX }), ...y }
    }
    return panel.view === 'back'
      ? { x0: round({ value: -box.maxX }), x1: round({ value: -box.minX }), ...y }
      : { x0: round({ value: box.minX }), x1: round({ value: box.maxX }), ...y }
  }
  const regions = Object.fromEntries(
    spec.panels.map((panel, index) => {
      const box = boxes[index]
      return [
        panel.id,
        {
          label: panel.label,
          // Canonical sleeves are named for the wearer; render sides for the
          // camera, where `left` is the wearer's right (as on every tee).
          renderPanel: RENDER_SIDE[panel.id] ?? panel.id,
          // Canonical x runs toward the wearer's left on every panel; a back
          // panel is printed as seen from behind, so it renders mirrored.
          renderMirrorX: panel.view === 'back',
          mesh: panel.pieces.map((pick) => pick.node).join(' '),
          uv: rects[index],
          axes: {
            x:
              panel.view === 'back'
                ? "toward the wearer's left (mirrored when seen from behind)"
                : `across the ${panel.label.toLowerCase()} as seen from the ${panel.view}`,
            y: 'up the garment',
          },
          landmarks: {},
          notes: [
            panel.wrap === 'torso'
              ? `Wrapped round the body to the side seams; ${(box.width * 100).toFixed(1)} × ${(box.height * 100).toFixed(1)} cm.`
              : panel.wrap
                ? `Wrapped all round the sleeve, seam on the inner side; ${(box.width * 100).toFixed(1)} × ${(box.height * 100).toFixed(1)} cm.`
                : `Planar print from the ${panel.view}; ${(box.width * 100).toFixed(1)} × ${(box.height * 100).toFixed(1)} cm.`,
          ],
          surface: { stretchY: 1, panelAspect: round({ value: box.width / box.height }) },
          center: centers[index],
          // Where the panel lies in the garment's print space (metres, canonical
          // x: toward the wearer's left), so base stripes and checks can be
          // phased from one origin and meet at the seams.
          ...(spec.frames ? { frame: printFrame({ index }) } : {}),
        },
      ]
    }),
  )
  writeManifest({ spec, generator: `scripts/build-template.mjs (${piecesFile})`, source: piecesFile, sha256, bounds, regions })

  const printedTriangles = Object.fromEntries(
    spec.panels.map((panel) => [
      panel.id,
      plans.filter((plan) => plan.panel === panel).reduce((sum, plan) => sum + plan.printed.reduce((a, b) => a + b, 0), 0),
    ]),
  )
  console.log(JSON.stringify({ out: spec.out, manifest: spec.manifest, sha256, pxPerCm: round({ value: scale / 100 }), printedTriangles }, null, 2))
}

if (values.inspect) {
  await inspect({ file: values.inspect })
} else if (values.pieces) {
  await build({ piecesFile: values.pieces })
} else {
  console.error('Usage: build-template.mjs --pieces <templates/x.pieces.json> | --inspect <glb>')
  process.exit(1)
}
