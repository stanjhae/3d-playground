import { Mesh, type Object3D, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'

import { createTeeMesh } from './tee-geometry'
import { CURRENT_TEMPLATE } from './template-manifest'

/**
 * The tee is one sound garment: no detached pieces, no holes beyond its real
 * openings, no inverted or broken faces (R16). `panel-orientation.test.ts`
 * checks the atlas faces outward; this checks the mesh itself. How it looks
 * is still a person's call.
 */

/** Open edges each piece has at its real openings: hem, neck, sleeve ends. */
const OPEN_EDGES: Record<string, number> = {
  body: 72,
  'body-sleeve-left': 40,
  'body-sleeve-right': 40,
  'body-collar': 50,
}

const tee: Object3D = createTeeMesh(CURRENT_TEMPLATE.geometry.structural)
tee.updateMatrixWorld(true)
const meshes: Mesh[] = []
tee.traverse((node) => {
  if (node instanceof Mesh) {
    meshes.push(node)
  }
})

function inspect(mesh: Mesh) {
  const position = mesh.geometry.getAttribute('position')
  const normal = mesh.geometry.getAttribute('normal')
  const index = mesh.geometry.getIndex()!
  // Seams repeat a point for its UVs, so points are joined by where they are.
  const ids = new Map<string, number>()
  const pointId = (at: number) => {
    const key = [position.getX(at), position.getY(at), position.getZ(at)].map((value) => value.toFixed(4)).join()
    return ids.get(key) ?? (ids.set(key, ids.size), ids.size - 1)
  }
  const edges = new Map<string, number>()
  const parent: number[] = []
  const root = (id: number): number => {
    parent[id] ??= id
    return parent[id] === id ? id : (parent[id] = root(parent[id]!))
  }
  let [degenerate, flipped] = [0, 0]

  for (let at = 0; at < index.count; at += 3) {
    const corners = [index.getX(at), index.getX(at + 1), index.getX(at + 2)]
    const [a, b, c] = corners.map((corner) => new Vector3().fromBufferAttribute(position, corner))
    const face = b!.clone().sub(a!).cross(c!.clone().sub(a!))
    degenerate += face.length() / 2 < 1e-9 ? 1 : 0
    const smooth = corners.reduce((sum, corner) => sum.add(new Vector3().fromBufferAttribute(normal, corner)), new Vector3())
    flipped += smooth.dot(face) < 0 ? 1 : 0
    const points = corners.map(pointId)

    points.forEach((point, side) => {
      const next = points[(side + 1) % 3]!
      const key = point < next ? `${point}-${next}` : `${next}-${point}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
      parent[root(point)] = root(next)
    })
  }

  return {
    degenerate,
    flipped,
    pieces: new Set([...ids.values()].map(root)).size,
    open: [...edges.values()].filter((count) => count === 1).length,
    overShared: [...edges.values()].filter((count) => count > 2).length,
  }
}

function closestGap(one: Mesh, two: Mesh) {
  const world = (mesh: Mesh) => {
    const position = mesh.geometry.getAttribute('position')
    return Array.from({ length: position.count }, (_, at) => new Vector3().fromBufferAttribute(position, at).applyMatrix4(mesh.matrixWorld))
  }
  const others = world(two)
  return Math.min(...world(one).map((point) => Math.min(...others.map((other) => point.distanceTo(other)))))
}

describe('the tee mesh', () => {
  test('has the pieces it should', () => {
    expect(meshes.map((mesh) => mesh.name).sort()).toEqual(Object.keys(OPEN_EDGES).sort())
  })

  test.each(meshes.map((mesh) => [mesh.name, mesh] as const))('%s is one sound piece, open only where it should be', (name, mesh) => {
    expect(inspect(mesh)).toEqual({ degenerate: 0, flipped: 0, pieces: 1, overShared: 0, open: OPEN_EDGES[name] })
  })

  test('no point is out of range', () => {
    for (const mesh of meshes) {
      expect(Array.from(mesh.geometry.getAttribute('position').array as ArrayLike<number>).every(Number.isFinite), mesh.name).toBe(true)
    }
  })

  test('the sleeves and collar touch the body, so nothing floats', () => {
    const body = meshes.find((mesh) => mesh.name === 'body')!

    for (const mesh of meshes.filter((entry) => entry !== body)) {
      expect(closestGap(mesh, body), mesh.name).toBeLessThan(0.06)
    }
  })
})
