import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh } from 'three'
import { describe, expect, test } from 'vitest'

import {
  clampShape,
  createShapeRig,
  deformGeometry,
  deformPositions,
  type GarmentShape,
  isNeutralShape,
  measureShapeFrame,
  NEUTRAL_SHAPE,
  SHAPE_LIMITS,
  type ShapeFrame,
  type ShapePart,
} from './garment-shape'

/**
 * A stand-in tee in garment space (+x the wearer's left, +y up, +z front):
 * a body sheet from hem (y 0.9) to shoulders (y 1.5), a sleeve sewn on at
 * each side (x = ±0.2, y 1.3–1.5) reaching out 0.2, and a collar ring on top.
 */
function grid({
  x,
  y,
  z,
}: {
  x: [number, number, number]
  y: [number, number, number]
  z: number
}) {
  const points: number[] = []

  for (let i = 0; i <= Math.round((x[1] - x[0]) / x[2]); i += 1) {
    for (let j = 0; j <= Math.round((y[1] - y[0]) / y[2]); j += 1) {
      points.push(Math.fround(x[0] + i * x[2]), Math.fround(y[0] + j * y[2]), Math.fround(z))
    }
  }

  return points
}

const BODY = grid({ x: [-0.2, 0.2, 0.02], y: [0.9, 1.5, 0.02], z: 0.1 })
const SLEEVES = [
  ...grid({ x: [0.2, 0.4, 0.02], y: [1.3, 1.5, 0.02], z: 0.1 }),
  ...grid({ x: [-0.4, -0.2, 0.02], y: [1.3, 1.5, 0.02], z: 0.1 }),
]
const COLLAR = (() => {
  const points: number[] = []

  for (let step = 0; step < 24; step += 1) {
    const angle = (step / 24) * Math.PI * 2
    points.push(Math.sin(angle) * 0.08, 1.52, Math.cos(angle) * 0.06)
  }

  return points
})()

const PARTS: { part: ShapePart; positions: number[] }[] = [
  { part: 'body', positions: BODY },
  { part: 'sleeves', positions: SLEEVES },
  { part: 'collar', positions: COLLAR },
]

const frame = measureShapeFrame({ parts: PARTS }) as ShapeFrame

function shaped(patch: Partial<GarmentShape>): GarmentShape {
  return { ...NEUTRAL_SHAPE, ...patch }
}

function point(positions: ArrayLike<number>, at: number) {
  return [positions[at * 3]!, positions[at * 3 + 1]!, positions[at * 3 + 2]!]
}

/** Index of the point nearest (x, y) in a flat list. */
function nearest(positions: number[], x: number, y: number) {
  let best = 0

  for (let at = 0; at < positions.length / 3; at += 1) {
    const [px, py] = point(positions, at)
    const [bx, by] = point(positions, best)

    if (Math.hypot(px! - x, py! - y) < Math.hypot(bx! - x, by! - y)) {
      best = at
    }
  }

  return best
}

function geometryOf(positions: number[]) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  const count = positions.length / 3
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2).map((_, at) => at / (count * 2)), 2))
  geometry.setAttribute('uv1', new BufferAttribute(new Float32Array(count * 2).fill(0.5), 2))
  geometry.setIndex(Array.from({ length: Math.floor(count / 3) * 3 }, (_, at) => at))
  return geometry
}

describe('measureShapeFrame', () => {
  test('finds the centre line, hem, armpit and both sleeves', () => {
    expect(frame.centerX).toBeCloseTo(0, 6)
    expect(frame.hemY).toBeCloseTo(0.9, 6)
    expect(frame.armpitY).toBeCloseTo(1.3, 6)
    expect(frame.sleeves.plusX?.axis[0]).toBeGreaterThan(0.9)
    expect(frame.sleeves.minusX?.axis[0]).toBeLessThan(-0.9)
    expect(frame.sleeves.plusX?.reach).toBeCloseTo(0.2, 2)
    expect(frame.collar?.halfWidth).toBeCloseTo(0.08, 2)
  })
})

describe('deformPositions', () => {
  test('a neutral shape moves nothing', () => {
    for (const { part, positions } of PARTS) {
      expect(Array.from(deformPositions({ positions, part, shape: NEUTRAL_SHAPE, frame }))).toEqual(
        Array.from(Float32Array.from(positions)),
      )
    }
  })

  test('the wearer-left sleeve tip moves out; its seam, the other sleeve and the body stay', () => {
    const shape = shaped({ leftSleeveLength: 0.5 })
    const sleeves = deformPositions({ positions: SLEEVES, part: 'sleeves', shape, frame })
    const tip = nearest(SLEEVES, 0.4, 1.4)
    const seam = nearest(SLEEVES, 0.2, 1.4)
    const otherTip = nearest(SLEEVES, -0.4, 1.4)

    // Half its own reach further out along the sleeve's axis.
    expect(point(sleeves, tip)[0]! - point(SLEEVES, tip)[0]!).toBeCloseTo(0.1, 2)
    expect(point(sleeves, seam)).toEqual(point(Float32Array.from(SLEEVES), seam))
    expect(point(sleeves, otherTip)).toEqual(point(Float32Array.from(SLEEVES), otherTip))

    for (const part of ['body', 'collar'] as const) {
      const source = PARTS.find((entry) => entry.part === part)!.positions
      expect(Array.from(deformPositions({ positions: source, part, shape, frame }))).toEqual(
        Array.from(Float32Array.from(source)),
      )
    }
  })

  test('shortening pulls the cuff back toward the shoulder', () => {
    const sleeves = deformPositions({ positions: SLEEVES, part: 'sleeves', shape: shaped({ rightSleeveLength: -0.5 }), frame })
    const tip = nearest(SLEEVES, -0.4, 1.4)
    expect(point(sleeves, tip)[0]! - point(SLEEVES, tip)[0]!).toBeCloseTo(0.1, 2)
  })

  test('body length moves the hem and leaves everything above the armpits', () => {
    const body = deformPositions({ positions: BODY, part: 'body', shape: shaped({ bodyLength: 0.25 }), frame })
    const hem = nearest(BODY, 0, 0.9)
    const chest = nearest(BODY, 0, 1.4)

    expect(point(body, hem)[1]).toBeCloseTo(0.9 - 0.25 * 0.4, 5)
    expect(point(body, chest)).toEqual(point(Float32Array.from(BODY), chest))
  })

  test('width widens about the centre line below the armpits only', () => {
    const body = deformPositions({ positions: BODY, part: 'body', shape: shaped({ bodyWidth: 0.2 }), frame })
    const side = nearest(BODY, 0.2, 1.0)
    const shoulder = nearest(BODY, 0.2, 1.4)
    const centre = nearest(BODY, 0, 1.0)

    expect(point(body, side)[0]).toBeCloseTo(0.24, 5)
    expect(point(body, shoulder)).toEqual(point(Float32Array.from(BODY), shoulder))
    expect(point(body, centre)[0]).toBeCloseTo(0, 6)
  })

  test('the neckline drops at the centre front, not the back or sides', () => {
    const collar = deformPositions({ positions: COLLAR, part: 'collar', shape: shaped({ necklineDepth: 1 }), frame })
    // Step 0 is the centre front (z = +0.06), 12 the centre back, 6 a side.
    expect(point(collar, 0)[1]).toBeCloseTo(1.52 - 0.08, 3)
    expect(point(collar, 12)[1]).toBeCloseTo(1.52, 6)
    expect(point(collar, 6)[1]).toBeCloseTo(1.52, 3)
  })

  test('the neckline never folds the chest over itself', () => {
    const column = grid({ x: [0, 0, 1], y: [1.2, 1.5, 0.005], z: 0.1 })
    const moved = deformPositions({ positions: column, part: 'body', shape: shaped({ necklineDepth: 1 }), frame })

    for (let at = 1; at < moved.length / 3; at += 1) {
      expect(point(moved, at)[1]).toBeGreaterThan(point(moved, at - 1)[1]!)
    }
  })
})

describe('deformGeometry', () => {
  const geometry = geometryOf(SLEEVES)
  const shape = shaped({ leftSleeveLength: 1, bodyLength: 0.3, bodyWidth: 0.2, necklineDepth: 1 })

  test('keeps vertex, UV and index counts, and the UVs themselves', () => {
    const out = deformGeometry({ geometry, toGarment: new Matrix4(), part: 'sleeves', shape, frame })

    expect(out).not.toBe(geometry)
    expect(out.getAttribute('position').count).toBe(geometry.getAttribute('position').count)
    expect(out.getAttribute('uv').count).toBe(geometry.getAttribute('uv').count)
    expect(Array.from(out.getAttribute('uv').array)).toEqual(Array.from(geometry.getAttribute('uv').array))
    expect(Array.from(out.getAttribute('uv1').array)).toEqual(Array.from(geometry.getAttribute('uv1').array))
    expect(out.getIndex()!.count).toBe(geometry.getIndex()!.count)
    expect(out.getAttribute('position').array).not.toEqual(geometry.getAttribute('position').array)
  })

  test('works through a mesh transform and maps back to local space', () => {
    // A mesh stored in millimetres: local = garment × 1000.
    const local = geometryOf(SLEEVES.map((value) => value * 1000))
    const toGarment = new Matrix4().makeScale(0.001, 0.001, 0.001)
    const out = deformGeometry({ geometry: local, toGarment, part: 'sleeves', shape: shaped({ leftSleeveLength: 0.5 }), frame })
    const tip = nearest(SLEEVES, 0.4, 1.4)

    expect(out.getAttribute('position').getX(tip) - 400).toBeCloseTo(100, 0)
  })

  test('a neutral shape returns the geometry itself', () => {
    expect(deformGeometry({ geometry, toGarment: new Matrix4(), part: 'sleeves', shape: NEUTRAL_SHAPE, frame })).toBe(geometry)
  })
})

describe('createShapeRig', () => {
  test('swaps deformed geometry in and restores the original when neutral', () => {
    const root = new Group()
    const meshes = [
      new Mesh(geometryOf(BODY)),
      new Mesh(geometryOf(SLEEVES)),
      new Mesh(geometryOf(COLLAR)),
    ]
    meshes[0]!.name = 'body-front'
    meshes[1]!.name = 'body-sleeves'
    meshes[2]!.name = 'body-collar'
    root.add(...meshes)
    const originals = meshes.map((mesh) => mesh.geometry)
    const rig = createShapeRig({ root, meshes })

    expect(rig.size).toBe(3)
    expect(rig.apply({ shape: shaped({ leftSleeveLength: 0.5 }) })).toBe(true)
    expect(meshes[1]!.geometry).not.toBe(originals[1])
    expect(rig.apply({ shape: shaped({ leftSleeveLength: 0.5 }) })).toBe(false)
    expect(rig.apply({ shape: undefined })).toBe(true)
    expect(meshes.map((mesh) => mesh.geometry)).toEqual(originals)
  })

  test('a mesh outside the shape map is left alone', () => {
    const root = new Group()
    const mesh = new Mesh(geometryOf(BODY))
    mesh.name = 'skirt'
    root.add(mesh)
    expect(createShapeRig({ root, meshes: [mesh] }).size).toBe(0)
  })
})

describe('shape params', () => {
  test('clamps to the safe ranges and rounds to three decimals', () => {
    expect(clampShape({ shape: { leftSleeveLength: 9, bodyWidth: -9, necklineDepth: 0.12345 } })).toEqual({
      ...NEUTRAL_SHAPE,
      leftSleeveLength: SHAPE_LIMITS.leftSleeveLength.max,
      bodyWidth: SHAPE_LIMITS.bodyWidth.min,
      necklineDepth: 0.123,
    })
    expect(clampShape({ shape: { bodyLength: Number.NaN } }).bodyLength).toBe(0)
  })

  test('neutral means every field 0, or no shape at all', () => {
    expect(isNeutralShape({ shape: undefined })).toBe(true)
    expect(isNeutralShape({ shape: NEUTRAL_SHAPE })).toBe(true)
    expect(isNeutralShape({ shape: shaped({ bodyLength: 0.01 }) })).toBe(false)
  })
})
