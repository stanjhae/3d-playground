import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh } from 'three'
import { beforeAll, describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument, readCanonicalDocument, validateCanonicalDocument } from './canonical-document'
import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
import { createShapeRig, deformGeometry, shapeMapFor } from './garment-shape'
import {
  CROP_FRAME,
  DRESS_FRAME,
  HOODIE_FRAME,
  type ShapeMap,
  TROUSERS_FRAME,
  VEST_FRAME,
} from './garment-shape-maps'
import {
  clampShape,
  type GarmentShape,
  isNeutralShape,
  neutralShapeFor,
  type ShapeField,
  type ShapeSpec,
  shapeSpecFor,
} from './garment-shape-params'
import { writableShapeSpec } from './shape-beta'
import { toRenderDocument } from './render-projection'
import { CROP_V1 } from './templates/crop'
import { DRESS_V1 } from './templates/dress'
import { HOODIE_V1 } from './templates/hoodie'
import { TROUSERS_V1 } from './templates/trousers'
import { VEST_V1 } from './templates/vest'
import type { TemplateManifest } from './template-manifest'

/** Node's file reader; tests run in Vitest, not the browser bundle. */
async function readBytes({ path }: { path: string }) {
  const { readFileSync } = (await import(
    // @ts-expect-error Node built-in
    'node:fs'
  )) as { readFileSync: (filePath: string) => Uint8Array<ArrayBuffer> }
  return readFileSync(path)
}

type ModelMesh = {
  name: string
  /** Flat xyz in garment space (the model root's). */
  positions: Float32Array
  uv: Float32Array
  index: Uint32Array
}

/** Each mesh of a template's GLB, in garment space. */
async function loadModel({ manifest }: { manifest: TemplateManifest }): Promise<ModelMesh[]> {
  // @ts-expect-error untyped CommonJS module
  const draco3d = (await import('draco3dgltf')) as { default: { createDecoderModule: () => Promise<unknown> } }
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.default.createDecoderModule() })
  const document = await io.readBinary(await readBytes({ path: `public${manifest.geometry.file}` }))
  const meshes: ModelMesh[] = []

  for (const node of document.getRoot().listNodes()) {
    const primitive = node.getMesh()?.listPrimitives()[0]

    if (!primitive) {
      continue
    }

    const toGarment = new Matrix4().fromArray(node.getWorldMatrix())
    const local = new BufferGeometry()
    local.setAttribute('position', new BufferAttribute(Float32Array.from(primitive.getAttribute('POSITION')!.getArray()!), 3))
    local.applyMatrix4(toGarment)
    meshes.push({
      name: node.getName(),
      positions: local.getAttribute('position').array as Float32Array,
      uv: Float32Array.from(primitive.getAttribute('TEXCOORD_1')!.getArray()!),
      index: Uint32Array.from(primitive.getIndices()!.getArray()!),
    })
  }

  return meshes
}

type Garment = {
  manifest: TemplateManifest
  spec: ShapeSpec
  map: ShapeMap
  meshes: ModelMesh[]
  frame: unknown
}

const GARMENTS: Record<string, TemplateManifest> = {
  hoodie: HOODIE_V1,
  vest: VEST_V1,
  crop: CROP_V1,
  dress: DRESS_V1,
  trousers: TROUSERS_V1,
}

const loaded: Record<string, Garment> = {}

beforeAll(async () => {
  for (const [garmentId, manifest] of Object.entries(GARMENTS)) {
    const map = shapeMapFor({ garmentId, garmentVersion: manifest.version })!
    const meshes = await loadModel({ manifest })
    const frame = map.measure({
      parts: meshes.filter((mesh) => map.parts[mesh.name]).map((mesh) => ({ part: map.parts[mesh.name]!, positions: mesh.positions })),
    })
    loaded[garmentId] = { manifest, spec: shapeSpecFor({ template: manifest })!, map, meshes, frame }
  }
}, 60_000)

/** Every mesh's positions after `shape` (meshes the map doesn't reach stay put). */
function deformAll({ garment, shape }: { garment: Garment; shape: GarmentShape }) {
  return garment.meshes.map((mesh) => {
    const part = garment.map.parts[mesh.name]
    return part ? garment.map.deform({ positions: mesh.positions, part, shape, frame: garment.frame }) : mesh.positions
  })
}

/** Vertex pairs (across all meshes) that sit within `gap` of each other: the sewn seams. */
function coincidentPairs({ meshes, gap = 0.0005 }: { meshes: ModelMesh[]; gap?: number }) {
  const cell = gap * 2
  const grid = new Map<string, [number, number][]>()
  const pairs: [number, number, number, number][] = []

  meshes.forEach((mesh, which) => {
    for (let at = 0; at < mesh.positions.length / 3; at += 1) {
      const [x, y, z] = [mesh.positions[at * 3]!, mesh.positions[at * 3 + 1]!, mesh.positions[at * 3 + 2]!]
      const [i, j, k] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)]

      for (let a = -1; a <= 1; a += 1) {
        for (let b = -1; b <= 1; b += 1) {
          for (let c = -1; c <= 1; c += 1) {
            for (const [otherMesh, other] of grid.get(`${i + a},${j + b},${k + c}`) ?? []) {
              const p = meshes[otherMesh]!.positions
              const distance = Math.hypot(p[other * 3]! - x, p[other * 3 + 1]! - y, p[other * 3 + 2]! - z)

              if (distance <= gap) {
                pairs.push([which, at, otherMesh, other])
              }
            }
          }
        }
      }

      const key = `${i},${j},${k}`
      const bucket = grid.get(key)

      if (bucket) {
        bucket.push([which, at])
      } else {
        grid.set(key, [[which, at]])
      }
    }
  })

  return pairs
}

/** The extremes each slider reaches, alone and together, and the pair pulled apart. */
function extremeShapes({ spec }: { spec: ShapeSpec }): GarmentShape[] {
  const at = (pick: (field: ShapeField) => number) => Object.fromEntries(spec.fields.map((field) => [field, pick(field)]))
  const shapes: GarmentShape[] = [at((field) => spec.limits[field]!.min), at((field) => spec.limits[field]!.max)]

  for (const field of spec.fields) {
    shapes.push({ ...neutralShapeFor({ spec }), [field]: spec.limits[field]!.min })
    shapes.push({ ...neutralShapeFor({ spec }), [field]: spec.limits[field]!.max })
  }

  if (spec.pair) {
    const [left, right] = spec.pair.fields
    shapes.push({ ...at((field) => spec.limits[field]!.max), [right]: spec.limits[right]!.min })
    shapes.push({ ...at((field) => spec.limits[field]!.min), [left]: spec.limits[left]!.max })
  }

  return shapes.filter((shape) => !isNeutralShape({ shape }))
}

function triangleNormal(positions: ArrayLike<number>, a: number, b: number, c: number) {
  const [ax, ay, az] = [positions[a * 3]!, positions[a * 3 + 1]!, positions[a * 3 + 2]!]
  const [ux, uy, uz] = [positions[b * 3]! - ax, positions[b * 3 + 1]! - ay, positions[b * 3 + 2]! - az]
  const [vx, vy, vz] = [positions[c * 3]! - ax, positions[c * 3 + 1]! - ay, positions[c * 3 + 2]! - az]
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx] as const
}

describe.each(Object.keys(GARMENTS))('%s: shape map', (garmentId) => {
  test('the template has a shape map, and its fields are the spec’s', () => {
    const { manifest, spec } = loaded[garmentId]!
    expect(spec.fields.length).toBeGreaterThan(0)
    expect(spec.controls.map((control) => control.field).sort()).toEqual([...spec.fields].sort())

    for (const field of spec.fields) {
      expect(spec.limits[field]!.min, field).toBeLessThanOrEqual(0)
      expect(spec.limits[field]!.max, field).toBeGreaterThan(0)
    }

    expect(shapeMapFor({ garmentId, garmentVersion: manifest.version })).not.toBeNull()
    expect(shapeMapFor({ garmentId, garmentVersion: manifest.version + 1 })).toBeNull()
  })

  test('a neutral shape is the identity', () => {
    const garment = loaded[garmentId]!
    const moved = deformAll({ garment, shape: neutralShapeFor({ spec: garment.spec }) })
    garment.meshes.forEach((mesh, at) => expect(moved[at]).toEqual(mesh.positions))
  })

  test('every slider moves the cloth, within the model', () => {
    const garment = loaded[garmentId]!

    for (const field of garment.spec.fields) {
      const max = garment.spec.limits[field]!.max
      const moved = deformAll({ garment, shape: { ...neutralShapeFor({ spec: garment.spec }), [field]: max } })
      let most = 0

      garment.meshes.forEach((mesh, which) => {
        for (let at = 0; at < mesh.positions.length; at += 1) {
          most = Math.max(most, Math.abs(moved[which]![at]! - mesh.positions[at]!))
        }
      })

      // Visible (over 5 mm), and never flung across the scene.
      expect(most, field).toBeGreaterThan(0.005)
      expect(most, field).toBeLessThan(0.4)
    }
  })

  test('at every limit, seams stay sewn and no triangle turns over', () => {
    const garment = loaded[garmentId]!
    const pairs = coincidentPairs({ meshes: garment.meshes })

    for (const shape of extremeShapes({ spec: garment.spec })) {
      const moved = deformAll({ garment, shape })
      let torn = 0

      for (const [meshA, a, meshB, b] of pairs) {
        const [p, q] = [moved[meshA]!, moved[meshB]!]
        const distance = Math.hypot(p[a * 3]! - q[b * 3]!, p[a * 3 + 1]! - q[b * 3 + 1]!, p[a * 3 + 2]! - q[b * 3 + 2]!)

        if (distance > 0.001) {
          torn += 1
        }
      }

      expect(torn, JSON.stringify(shape)).toBe(0)

      let flipped = 0
      let counted = 0

      garment.meshes.forEach((mesh, which) => {
        for (let corner = 0; corner < mesh.index.length; corner += 3) {
          const [a, b, c] = [mesh.index[corner]!, mesh.index[corner + 1]!, mesh.index[corner + 2]!]
          const before = triangleNormal(mesh.positions, a, b, c)
          const area = Math.hypot(...before)

          // Slivers have no reliable facing.
          if (area < 1e-7) {
            continue
          }

          const after = triangleNormal(moved[which]!, a, b, c)
          counted += 1

          if (before[0] * after[0] + before[1] * after[1] + before[2] * after[2] <= 0) {
            flipped += 1
          }
        }
      })

      expect(counted).toBeGreaterThan(0)
      expect(flipped, JSON.stringify(shape)).toBe(0)
    }
  })

  test('deformGeometry keeps vertex, index and UV counts and the UVs themselves', () => {
    const garment = loaded[garmentId]!
    const mesh = garment.meshes.find((entry) => garment.map.parts[entry.name])!
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(mesh.positions.slice(), 3))
    geometry.setAttribute('uv1', new BufferAttribute(mesh.uv.slice(), 2))
    geometry.setIndex(new BufferAttribute(mesh.index.slice(), 1))
    const max = Object.fromEntries(garment.spec.fields.map((field) => [field, garment.spec.limits[field]!.max]))
    const out = deformGeometry({
      geometry,
      toGarment: new Matrix4(),
      part: garment.map.parts[mesh.name]!,
      shape: max,
      frame: garment.frame,
      map: garment.map,
    })

    expect(out).not.toBe(geometry)
    expect(out.getAttribute('position').count).toBe(geometry.getAttribute('position').count)
    expect(out.getIndex()!.count).toBe(geometry.getIndex()!.count)
    expect(out.getAttribute('uv1').array).toEqual(geometry.getAttribute('uv1').array)
    expect(out.getAttribute('position').array).not.toEqual(geometry.getAttribute('position').array)
    expect(deformGeometry({ geometry, toGarment: new Matrix4(), part: 'body', shape: neutralShapeFor({ spec: garment.spec }), frame: garment.frame, map: garment.map })).toBe(geometry)
  })

  test('the document refuses values past the limits and fields of another garment', () => {
    const { manifest, spec } = loaded[garmentId]!
    const document = createEmptyCanonicalDocument({ templateId: manifest.id })
    expect(document.template).toEqual({ id: manifest.id, version: manifest.version })
    const field = spec.fields[0]!
    const shaped = { ...neutralShapeFor({ spec }), [field]: spec.limits[field]!.max }
    expect(validateCanonicalDocument({ value: { ...document, shape: shaped } }).ok).toBe(true)

    const past = validateCanonicalDocument({ value: { ...document, shape: { ...shaped, [field]: spec.limits[field]!.max + 0.01 } } })
    expect(past.ok).toBe(false)
    const under = validateCanonicalDocument({ value: { ...document, shape: { ...shaped, [field]: spec.limits[field]!.min - 0.01 } } })
    expect(under.ok).toBe(false)

    // A field this garment doesn't have (the tee's neckline on trousers, legs on a hoodie, …).
    const foreign = (['necklineDepth', 'leftLegLength', 'hemFlare'] as const).find((name) => !spec.fields.includes(name))!
    const unknown = validateCanonicalDocument({ value: { ...document, shape: { ...shaped, [foreign]: 0.1 } } })
    expect(unknown.ok).toBe(false)
    expect(unknown.ok ? [] : unknown.issues.map((issue) => issue.path)).toContain(`$.shape.${foreign}`)

    // The studio clamps to the same limits.
    expect(clampShape({ shape: { [field]: 99 }, spec })[field]).toBe(spec.limits[field]!.max)
    expect(Object.keys(clampShape({ shape: { [foreign]: 0.3 }, spec })).sort()).toEqual([...spec.fields].sort())
  })

  test('migration fills a partial block with the garment’s own fields, and drops a neutral one', () => {
    const { manifest, spec } = loaded[garmentId]!
    const document = createEmptyCanonicalDocument({ templateId: manifest.id })
    const field = spec.fields[spec.fields.length - 1]!
    const read = readCanonicalDocument({ value: { ...document, shape: { [field]: spec.limits[field]!.max } } })
    expect(read.ok).toBe(true)
    expect(read.ok && read.document.shape).toEqual({ ...neutralShapeFor({ spec }), [field]: spec.limits[field]!.max })

    const neutral = readCanonicalDocument({ value: { ...document, shape: neutralShapeFor({ spec }) } })
    expect(neutral.ok && 'shape' in neutral.document).toBe(false)
  })

  test('setShape stores only this garment’s fields, removes a neutral block, and renders it', () => {
    const { manifest, spec } = loaded[garmentId]!
    const document = createEmptyCanonicalDocument({ templateId: manifest.id })
    const field = spec.fields[0]!
    const set = applyCanonicalCommand({ stack: createCanonicalStack({ document }), command: { type: 'setShape', shape: { [field]: 0.1 } } })
    expect(set.ok).toBe(true)
    expect(set.stack.document.shape).toEqual({ ...neutralShapeFor({ spec }), [field]: 0.1 })
    expect(toRenderDocument({ document: set.stack.document }).document.shape).toEqual({ ...neutralShapeFor({ spec }), [field]: 0.1 })

    const back = applyCanonicalCommand({ stack: set.stack, command: { type: 'setShape', shape: { [field]: 0 } } })
    expect('shape' in back.stack.document).toBe(false)
  })

  test('the studio writes it only when the build turns on all garments (reader first)', () => {
    const { manifest } = loaded[garmentId]!
    expect(writableShapeSpec({ template: manifest, allGarments: false })).toBeNull()
    expect(writableShapeSpec({ template: manifest, allGarments: true })).toBe(shapeSpecFor({ template: manifest }))
    expect(writableShapeSpec({ template: { id: 'tee-crew-short', version: 7 }, allGarments: false })).not.toBeNull()
  })
})

describe('the rig on a loaded model', () => {
  test('reaches the map’s meshes, swaps deformed copies in and puts the originals back', () => {
    const garment = loaded.hoodie!
    const root = new Group()
    const meshes = garment.meshes.map((entry) => {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(entry.positions.slice(), 3))
      const mesh = new Mesh(geometry)
      mesh.name = entry.name
      root.add(mesh)
      return mesh
    })
    const originals = meshes.map((mesh) => mesh.geometry)
    const rig = createShapeRig({ root, meshes, map: garment.map })
    expect(rig.size).toBe(meshes.length)

    expect(rig.apply({ shape: { leftSleeveLength: 0.2, rightSleeveLength: 0, bodyLength: 0, bodyWidth: 0 } })).toBe(true)
    const sleeve = meshes.find((mesh) => mesh.name === 'body-7')!
    expect(sleeve.geometry).not.toBe(originals[meshes.indexOf(sleeve)])
    // The wearer's right sleeve and the back don't move.
    const back = meshes.find((mesh) => mesh.name === 'body')!
    expect(back.geometry.getAttribute('position').array).toEqual(originals[meshes.indexOf(back)]!.getAttribute('position').array)

    rig.dispose()
    meshes.forEach((mesh, at) => expect(mesh.geometry).toBe(originals[at]))
    expect(createShapeRig({ root, meshes, map: null }).size).toBe(0)
  })
})

/** Welded boundary loops of one mesh: each loop's vertex positions. */
function boundaryLoops({ mesh }: { mesh: ModelMesh }) {
  const weld = new Map<string, number>()
  const id: number[] = []

  for (let at = 0; at < mesh.positions.length / 3; at += 1) {
    const key = [0, 1, 2].map((axis) => Math.round(mesh.positions[at * 3 + axis]! * 1e4)).join(',')

    if (!weld.has(key)) {
      weld.set(key, at)
    }

    id.push(weld.get(key)!)
  }

  const edges = new Map<string, number>()

  for (let corner = 0; corner < mesh.index.length; corner += 3) {
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const [a, b] = [id[mesh.index[corner + i]!]!, id[mesh.index[corner + j]!]!]
      const key = a < b ? `${a},${b}` : `${b},${a}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }

  const neighbours = new Map<number, number[]>()

  for (const [key, count] of edges) {
    if (count === 1) {
      const [a, b] = key.split(',').map(Number) as [number, number]
      neighbours.set(a, [...(neighbours.get(a) ?? []), b])
      neighbours.set(b, [...(neighbours.get(b) ?? []), a])
    }
  }

  const seen = new Set<number>()
  const loops: { x: number; y: number; z: number }[][] = []

  for (const start of neighbours.keys()) {
    if (seen.has(start)) {
      continue
    }

    const stack = [start]
    const loop: { x: number; y: number; z: number }[] = []

    while (stack.length > 0) {
      const at = stack.pop()!

      if (!seen.has(at)) {
        seen.add(at)
        loop.push({ x: mesh.positions[at * 3]!, y: mesh.positions[at * 3 + 1]!, z: mesh.positions[at * 3 + 2]! })
        stack.push(...neighbours.get(at)!)
      }
    }

    loops.push(loop)
  }

  return loops
}

function range(values: number[]) {
  return { min: Math.min(...values), max: Math.max(...values) }
}

describe('the landmarks match the models they were measured from', () => {
  test('hoodie: the armpit is the lowest point a sleeve is sewn to the body', () => {
    const { meshes } = loaded.hoodie!
    const named = (name: string) => meshes.find((mesh) => mesh.name === name)!
    const body = [named('body'), named('body-3')]
    const sleeves = [named('body-1'), named('body-2'), named('body-7')]
    const sewn = coincidentPairs({ meshes: [...body, ...sleeves], gap: 0.001 }).filter(([a, , b]) => (a < 2) !== (b < 2))
    const armpitY = Math.min(...sewn.map(([a, at, b, other]) => (a < 2 ? body[a]!.positions[at * 3 + 1]! : body[b]!.positions[other * 3 + 1]!)))
    expect(armpitY).toBeCloseTo(HOODIE_FRAME.armpitY, 2)
    // Hem band and cuffs sit below their band lines.
    expect(range(Array.from(named('body-5').positions.filter((_, at) => at % 3 === 1 && named('body-5').positions[at]! < 1.2))).max).toBeLessThanOrEqual(HOODIE_FRAME.hemBandY + 0.001)
  })

  test('vest, crop top and dress: hem, armholes and neckline from the boundary loops', () => {
    for (const [garmentId, frame] of [
      ['vest', VEST_FRAME],
      ['crop', CROP_FRAME],
      ['dress', DRESS_FRAME],
    ] as const) {
      const loops = boundaryLoops({ mesh: loaded[garmentId]!.meshes[0]! })
      expect(loops, garmentId).toHaveLength(4)
      const byHeight = [...loops].sort((a, b) => range(a.map((p) => p.y)).min - range(b.map((p) => p.y)).min)
      const hem = byHeight[0]!
      const neck = loops.reduce((top, loop) => (range(loop.map((p) => p.y)).max > range(top.map((p) => p.y)).max ? loop : top))
      expect(range(hem.map((p) => p.y)).min, garmentId).toBeCloseTo(frame.hemY, 2)
      expect(range(neck.map((p) => p.y)).min, garmentId).toBeCloseTo(frame.neck.bottomY, 2)
      expect(Math.max(...neck.map((p) => Math.abs(p.x - frame.centerX))), garmentId).toBeCloseTo(frame.neck.halfWidth, 2)
    }

    // Sleeveless: the armholes' lowest points are the armpits.
    for (const [garmentId, frame] of [
      ['vest', VEST_FRAME],
      ['dress', DRESS_FRAME],
    ] as const) {
      const loops = boundaryLoops({ mesh: loaded[garmentId]!.meshes[0]! })
      const sides = loops.filter((loop) => Math.min(...loop.map((p) => Math.abs(p.x))) > 0.1)
      expect(sides, garmentId).toHaveLength(2)
      expect(Math.min(...sides.flatMap((loop) => loop.map((p) => p.y))), garmentId).toBeCloseTo(frame.armpitY, 2)
    }
  })

  test('crop top: the sleeves flare out from the torso at the armpit', () => {
    const { positions } = loaded.crop!.meshes[0]!
    const points = Array.from({ length: positions.length / 3 }, (_, at) => ({ x: positions[at * 3]!, y: positions[at * 3 + 1]! }))
    const torso = Math.max(...points.filter((p) => p.y > 1.09 && p.y < 1.2).map((p) => Math.abs(p.x - CROP_FRAME.centerX)))
    const armpitY = Math.min(...points.filter((p) => Math.abs(p.x - CROP_FRAME.centerX) > torso + 0.005).map((p) => p.y))
    expect(armpitY).toBeCloseTo(CROP_FRAME.armpitY, 2)
  })

  test('dress: the waist is its narrowest row between hips and bust', () => {
    const { positions } = loaded.dress!.meshes[0]!
    const halfWidthNear = (y: number) => {
      let most = 0

      for (let at = 0; at < positions.length; at += 3) {
        if (Math.abs(positions[at + 1]! - y) < 0.01) {
          most = Math.max(most, Math.abs(positions[at]!))
        }
      }

      return most
    }
    const rows = Array.from({ length: 16 }, (_, step) => 0.9 + step * 0.02)
    const waist = rows.reduce((best, y) => (halfWidthNear(y) < halfWidthNear(best) ? y : best))
    expect(Math.abs(waist - DRESS_FRAME.lengthTopY)).toBeLessThanOrEqual(0.03)
  })

  test('trousers: the crotch is where the legs part, the hems at the bottom', () => {
    const { positions } = loaded.trousers!.meshes[0]!
    let crotchY = Infinity
    let hemY = Infinity

    for (let at = 0; at < positions.length; at += 3) {
      hemY = Math.min(hemY, positions[at + 1]!)

      if (Math.abs(positions[at]! - TROUSERS_FRAME.centerX) < 0.005) {
        crotchY = Math.min(crotchY, positions[at + 1]!)
      }
    }

    expect(crotchY).toBeCloseTo(TROUSERS_FRAME.crotchY, 3)
    expect(hemY).toBeCloseTo(TROUSERS_FRAME.hemY, 3)
  })
})

describe('the tee keeps shape v1', () => {
  test('its spec is shape v1, unchanged', () => {
    for (const version of [4, 5, 6, 7]) {
      expect(shapeSpecFor({ template: { id: 'tee-crew-short', version } })!.fields).toEqual([
        'leftSleeveLength',
        'rightSleeveLength',
        'bodyLength',
        'bodyWidth',
        'necklineDepth',
      ])
    }

    expect(shapeSpecFor({ template: { id: 'tee-crew-short', version: 3 } })).toBeNull()
    expect(shapeSpecFor({ template: { id: 'coat', version: 1 } })).toBeNull()
  })
})
