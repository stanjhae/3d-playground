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

const PADDING_PX = 8
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

/** Shelf-pack panel boxes (metres) into a square atlas at the largest shared scale. */
function packPanels({ boxes, size }) {
  const fits = (scale) => {
    const order = boxes
      .map((box, index) => ({ index, width: box.width * scale, height: box.height * scale }))
      .sort((a, b) => b.height - a.height)
    const placed = []
    let x = PADDING_PX
    let y = PADDING_PX
    let shelf = 0

    for (const item of order) {
      if (x + item.width + PADDING_PX > size) {
        x = PADDING_PX
        y += shelf + PADDING_PX
        shelf = 0
      }
      if (x + item.width + PADDING_PX > size || y + item.height + PADDING_PX > size) {
        return null
      }
      placed[item.index] = { x, y, width: item.width, height: item.height }
      x += item.width + PADDING_PX
      shelf = Math.max(shelf, item.height)
    }
    return placed
  }

  let low = 1
  let high = size * 10

  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2
    if (fits(middle)) low = middle
    else high = middle
  }

  return { scale: low, placed: fits(low) }
}

function round({ value }) {
  return Math.round(value * 1e6) / 1e6
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

async function build({ piecesFile }) {
  const spec = JSON.parse(readFileSync(piecesFile, 'utf8'))
  const io = await createIo()
  const document = await io.read(spec.glb)
  if (spec.seat) seatModel({ document, seat: spec.seat })
  const nodes = new Map(meshNodes({ document }).map((node) => [node.getName(), node]))

  // 1. Which triangles print, on which panel, and where they project.
  const plans = []
  const boxes = []
  /** Where each panel sits on the garment (the mean of its printed vertices), for the camera. */
  const centers = []

  for (const panel of spec.panels) {
    const right = VIEW_RIGHT[panel.view]
    const toward = VIEW_TOWARD[panel.view]
    if (!right) throw new Error(`Panel ${panel.id}: unknown view ${panel.view}`)
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    const sum = { x: 0, y: 0, z: 0, count: 0 }

    for (const pick of panel.pieces) {
      const node = nodes.get(pick.node)
      if (!node) throw new Error(`Panel ${panel.id}: no mesh node ${pick.node}`)

      for (const primitive of node.getMesh().listPrimitives()) {
        const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
        const indices = primitive.getIndices().getArray()
        const pieces = pieceOfTriangle({ primitive })
        const keep = keptPiece({ pick, pieces, indices, world })

        const printed = new Uint8Array(pieces.length)
        for (let triangle = 0; triangle < pieces.length; triangle += 1) {
          if (keep !== null && pieces[triangle] !== keep) continue
          const [a, b, c] = indices.slice(triangle * 3, triangle * 3 + 3)
          const normal = faceNormal({ world, a, b, c })
          const facing = normal[0] * toward[0] + normal[1] * toward[1] + normal[2] * toward[2]
          if (facing < FACING_MIN) continue
          printed[triangle] = 1

          for (const vertex of [a, b, c]) {
            const px = world[vertex * 3] * right[0] + world[vertex * 3 + 1] * right[1] + world[vertex * 3 + 2] * right[2]
            const py = world[vertex * 3 + 1]
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

        plans.push({ panel, primitive, world, printed })
      }
    }

    if (!Number.isFinite(box.minX)) throw new Error(`Panel ${panel.id}: nothing faces the ${panel.view} view`)
    boxes.push({ ...box, width: box.maxX - box.minX, height: box.maxY - box.minY })
    centers.push([sum.x / sum.count, sum.y / sum.count, sum.z / sum.count].map((value) => round({ value })))
  }

  // 2. Pack panels at one shared scale.
  const size = spec.atlas
  const { scale, placed } = packPanels({ boxes, size })
  const rects = spec.panels.map((panel, index) => {
    const spot = placed[index]
    // v up, like the tee: v1 is the top of the atlas (CanvasTexture flipY).
    return {
      u0: round({ value: spot.x / size }),
      u1: round({ value: (spot.x + spot.width) / size }),
      v0: round({ value: 1 - (spot.y + spot.height) / size }),
      v1: round({ value: 1 - spot.y / size }),
    }
  })

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
      for (const plan of plansHere) {
        for (let triangle = 0; triangle < triangles; triangle += 1) {
          if (plan.printed[triangle] && owner[triangle] === -1) owner[triangle] = panelIndex.get(plan.panel.id)
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
          const key = `${vertex}:${panel}`
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
              const right = VIEW_RIGHT[spec.panels[panel].view]
              const box = boxes[panel]
              const rect = rects[panel]
              const px = world[vertex * 3] * right[0] + world[vertex * 3 + 1] * right[1] + world[vertex * 3 + 2] * right[2]
              const py = world[vertex * 3 + 1]
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

  // The whole garment's extent, for the camera to fit.
  const boundsMin = [Infinity, Infinity, Infinity]
  const boundsMax = [-Infinity, -Infinity, -Infinity]
  for (const node of meshNodes({ document })) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const world = worldPositions({ primitive, matrix: node.getWorldMatrix() })
      for (let index = 0; index < world.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          boundsMin[axis] = Math.min(boundsMin[axis], world[index + axis])
          boundsMax[axis] = Math.max(boundsMax[axis], world[index + axis])
        }
      }
    }
  }

  await io.write(spec.out, document)
  const sha256 = createHash('sha256').update(readFileSync(spec.out)).digest('hex')

  // 4. The manifest the app pins designs to.
  const regions = Object.fromEntries(
    spec.panels.map((panel, index) => {
      const box = boxes[index]
      return [
        panel.id,
        {
          label: panel.label,
          // The tee keeps its render routing (wearer's left sleeve on render `right`).
          renderPanel: panel.renderPanel ?? panel.id,
          renderMirrorX: false,
          mesh: panel.pieces.map((pick) => pick.node).join(' '),
          uv: rects[index],
          axes: { x: `across the ${panel.label.toLowerCase()} as seen from the ${panel.view}`, y: 'up the garment' },
          landmarks: {},
          notes: [`Planar print from the ${panel.view}; ${(box.width * 100).toFixed(1)} × ${(box.height * 100).toFixed(1)} cm.`],
          surface: { stretchY: 1, panelAspect: round({ value: box.width / box.height }) },
          center: centers[index],
        },
      ]
    }),
  )
  const manifest = {
    id: spec.templateId,
    version: spec.version,
    garmentId: spec.garmentId,
    orientation: 'wearer',
    geometry: {
      kind: 'glb',
      file: spec.out.replace(/^public/, ''),
      sha256,
      generator: `scripts/build-template.mjs (${piecesFile})`,
      bounds: { min: boundsMin.map((value) => round({ value })), max: boundsMax.map((value) => round({ value })) },
    },
    atlas: { width: size, height: size },
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
    `// Generated by scripts/build-template.mjs from ${piecesFile}. Do not edit by hand.\nimport type { TemplateManifest } from '../template-manifest.ts'\n\nexport const ${constName}: TemplateManifest = ${JSON.stringify(manifest, null, 2)}\n`,
  )

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
