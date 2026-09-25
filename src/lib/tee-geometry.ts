import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
} from 'three'

import type { HemId, NeckId, SleeveId } from './design-document'

export const TORSO_V0 = 0.28

function cotton() {
  return new MeshPhysicalMaterial({
    color: '#f3efe6',
    roughness: 0.86,
    metalness: 0,
    side: DoubleSide,
  })
}

type Ring = {
  y: number
  halfW: number
  halfD: number
}

const BODY_RINGS = [
  { y: 0.5, halfW: 0.224, halfD: 0.086 },
  { y: 0.62, halfW: 0.21, halfD: 0.08 },
  { y: 0.76, halfW: 0.198, halfD: 0.076 },
  { y: 0.92, halfW: 0.208, halfD: 0.088 },
  { y: 1.06, halfW: 0.222, halfD: 0.092 },
  { y: 1.16, halfW: 0.228, halfD: 0.088 },
  { y: 1.22, halfW: 0.198, halfD: 0.08 },
  { y: 1.27, halfW: 0.128, halfD: 0.072 },
  { y: 1.31, halfW: 0.09, halfD: 0.066 },
] as const

function bodyRings({
  hem,
}: {
  hem: HemId
}) {
  const y0 = hem === 'crop' ? 0.72 : 0.36
  const y1 = 1.31
  const base0 = BODY_RINGS[0]?.y ?? 0.5
  const base1 = BODY_RINGS[BODY_RINGS.length - 1]?.y ?? 1.31

  return BODY_RINGS.map((ring) => {
    const t = (ring.y - base0) / Math.max(0.001, base1 - base0)

    return {
      y: y0 + t * (y1 - y0),
      halfW: ring.halfW,
      halfD: ring.halfD,
    }
  })
}

function unwrapUv({
  theta,
  y,
  y0,
  y1,
}: {
  theta: number
  y: number
  y0: number
  y1: number
}) {
  const vBody = (y - y0) / Math.max(0.001, y1 - y0)
  const v = TORSO_V0 + vBody * (1 - TORSO_V0)

  if (theta <= Math.PI) {
    return { u: 0.5 * (1 - theta / Math.PI), v }
  }

  return { u: 0.5 + 0.5 * ((theta - Math.PI) / Math.PI), v }
}

function buildBody({
  rings,
  radial,
  neck,
}: {
  rings: Ring[]
  radial: number
  neck: NeckId
}): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const y0 = rings[0]?.y ?? 0
  const y1 = rings[rings.length - 1]?.y ?? 1

  for (const ring of rings) {
    for (let index = 0; index <= radial; index += 1) {
      const theta = (index / radial) * Math.PI * 2
      const x = ring.halfW * Math.cos(theta)
      let z = ring.halfD * Math.sin(theta)
      z *= z > 0 ? 1.14 : 0.9
      let y = ring.y
      const neckBand = (ring.y - y0) / Math.max(0.001, y1 - y0)

      if (neck === 'v' && z > 0 && neckBand > 0.7) {
        const towardCenter =
          1 - Math.min(1, Math.abs(x) / Math.max(0.001, ring.halfW))
        y -= towardCenter * towardCenter * (neckBand - 0.7) * 0.58
      }

      positions.push(x, y, z)
      const uv = unwrapUv({ theta, y: ring.y, y0, y1 })
      uvs.push(uv.u, uv.v)
    }
  }

  const columns = radial + 1
  const indices: number[] = []

  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let index = 0; index < radial; index += 1) {
      const a = row * columns + index
      const b = a + 1
      const c = (row + 1) * columns + index
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3),
  )
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function mapOpenCylinder({
  geometry,
  u0,
  u1,
  v0,
  v1,
}: {
  geometry: CylinderGeometry
  u0: number
  u1: number
  v0: number
  v1: number
}) {
  const uv = geometry.attributes.uv

  for (let index = 0; index < uv.count; index += 1) {
    const u = uv.getX(index)
    const v = uv.getY(index)
    uv.setXY(index, u0 + u * (u1 - u0), v0 + v * (v1 - v0))
  }

  uv.needsUpdate = true
}

function buildSleeve({
  side,
  sleeve,
}: {
  side: 'left' | 'right'
  sleeve: SleeveId
}) {
  const sign = side === 'left' ? -1 : 1
  const length = sleeve === 'long' ? 0.42 : 0.14
  const reach = sleeve === 'long' ? 0.42 : 0.28
  const geometry = new CylinderGeometry(0.06, 0.078, length, 20, 4, true)
  mapOpenCylinder({
    geometry,
    u0: side === 'left' ? 0 : 0.5,
    u1: side === 'left' ? 0.5 : 1,
    v0: 0,
    v1: TORSO_V0 - 0.002,
  })
  geometry.rotateZ(sign * (Math.PI / 2 - 0.32))
  geometry.translate(sign * reach, 1.14, 0)
  const mesh = new Mesh(geometry, cotton())
  mesh.name = side === 'left' ? 'body-sleeve-left' : 'body-sleeve-right'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildCollar({
  neck,
}: {
  neck: NeckId
}) {
  const top = neck === 'v' ? 0.082 : 0.094
  const bottom = neck === 'v' ? 0.09 : 0.1
  const geometry = new CylinderGeometry(top, bottom, 0.046, 24, 1, true)
  mapOpenCylinder({
    geometry,
    u0: 0,
    u1: 0.5,
    v0: 0.9,
    v1: 1,
  })
  geometry.translate(0, neck === 'v' ? 1.24 : 1.32, 0)
  const mesh = new Mesh(geometry, cotton())
  mesh.name = 'body-collar'
  mesh.castShadow = true
  return mesh
}

export function createClothingMesh({
  neck = 'crew',
  hem = 'long',
  sleeve = 'short',
}: {
  neck?: NeckId
  hem?: HemId
  sleeve?: SleeveId
} = {}) {
  const group = new Group()
  group.name = 'body'

  const body = new Mesh(
    buildBody({
      rings: bodyRings({ hem }),
      radial: 28,
      neck,
    }),
    cotton(),
  )
  body.name = 'body'
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  group.add(
    buildSleeve({ side: 'left', sleeve }),
    buildSleeve({ side: 'right', sleeve }),
    buildCollar({ neck }),
  )
  return group
}

export function createTeeMesh({
  neck = 'crew',
  hem = 'long',
  sleeve = 'short',
}: {
  neck?: NeckId
  hem?: HemId
  sleeve?: SleeveId
} = {}) {
  return createClothingMesh({ neck, hem, sleeve })
}

export function isHouseForm({
  garmentId,
}: {
  garmentId?: string | null
}) {
  return garmentId === 'tee'
}
