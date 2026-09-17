import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
} from 'three'

import type { NeckId } from './design-document'

function cotton() {
  return new MeshPhysicalMaterial({
    color: '#f3efe6',
    roughness: 0.86,
    metalness: 0,
    side: DoubleSide,
  })
}

function mapBoxPanel({
  geometry,
  width,
  height,
  front,
}: {
  geometry: BoxGeometry
  width: number
  height: number
  front: boolean
}) {
  const uv = geometry.attributes.uv
  const position = geometry.attributes.position

  for (let index = 0; index < position.count; index += 1) {
    const x = (position.getX(index) + width / 2) / width
    const y = (position.getY(index) + height / 2) / height
    uv.setXY(index, front ? x * 0.5 : 0.5 + x * 0.5, y)
  }

  uv.needsUpdate = true
}

export function createTeeMesh({
  neck = 'crew',
}: {
  neck?: NeckId
} = {}) {
  const group = new Group()
  group.name = 'body'

  const torso = new BoxGeometry(0.48, 0.72, 0.16)
  mapBoxPanel({ geometry: torso, width: 0.48, height: 0.72, front: true })
  torso.translate(0, 0.86, 0)
  const body = new Mesh(torso, cotton())
  body.name = 'body'
  body.castShadow = true
  body.receiveShadow = true

  const sleeveGeo = new BoxGeometry(0.34, 0.16, 0.16)
  mapBoxPanel({ geometry: sleeveGeo, width: 0.34, height: 0.16, front: true })
  const left = new Mesh(sleeveGeo, cotton())
  left.name = 'body-sleeve-left'
  left.position.set(-0.36, 1.12, 0)
  left.rotation.z = 0.15
  left.castShadow = true

  const right = left.clone()
  right.name = 'body-sleeve-right'
  right.position.x = 0.36
  right.rotation.z = -0.15

  const collarWidth = neck === 'v' ? 0.12 : 0.18
  const collarHeight = neck === 'v' ? 0.16 : 0.08
  const collarGeo = new BoxGeometry(collarWidth, collarHeight, 0.08)
  mapBoxPanel({
    geometry: collarGeo,
    width: collarWidth,
    height: collarHeight,
    front: true,
  })
  const collar = new Mesh(collarGeo, cotton())
  collar.name = 'body-collar'
  collar.position.set(0, neck === 'v' ? 1.16 : 1.24, 0.02)

  group.add(body, left, right, collar)
  group.position.copy(new Vector3(0, 0, 0))
  return group
}
