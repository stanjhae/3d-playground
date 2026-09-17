import { BoxGeometry, Mesh } from 'three'
import { describe, expect, test } from 'vitest'

import { createTeeMesh, isHouseForm } from './tee-geometry'

function bodyMesh({
  group,
}: {
  group: ReturnType<typeof createTeeMesh>
}) {
  return group.children.find(
    (child) => child.name === 'body' && child instanceof Mesh,
  )
}

describe('createTeeMesh', () => {
  test('is clothing, not a crate', () => {
    const tee = createTeeMesh({ neck: 'crew' })
    const body = bodyMesh({ group: tee })

    expect(body).toBeInstanceOf(Mesh)
    if (!(body instanceof Mesh)) {
      return
    }

    expect(body.geometry).not.toBeInstanceOf(BoxGeometry)
    expect(body.geometry.attributes.position.count).toBeGreaterThan(200)
    expect(
      tee.children.some((child) => child.name === 'body-sleeve-left'),
    ).toBe(true)
    expect(
      tee.children.some((child) => child.name === 'body-sleeve-right'),
    ).toBe(true)
  })

  test('keeps the chest on the front and the back on the back', () => {
    const tee = createTeeMesh({ neck: 'crew' })
    const body = bodyMesh({ group: tee })

    expect(body).toBeInstanceOf(Mesh)
    if (!(body instanceof Mesh)) {
      return
    }

    const uv = body.geometry.attributes.uv
    const position = body.geometry.attributes.position

    expect(uv).toBeTruthy()

    let frontCount = 0
    let backCount = 0

    for (let index = 0; index < (uv?.count ?? 0); index += 1) {
      const u = uv.getX(index)
      const v = uv.getY(index)
      const z = position.getZ(index)

      expect(u).toBeGreaterThanOrEqual(-1e-6)
      expect(u).toBeLessThanOrEqual(1 + 1e-6)
      expect(v).toBeGreaterThanOrEqual(-1e-6)
      expect(v).toBeLessThanOrEqual(1 + 1e-6)

      if (z > 0.02) {
        expect(u).toBeLessThanOrEqual(0.5 + 1e-6)
        frontCount += 1
      }

      if (z < -0.02) {
        expect(u).toBeGreaterThanOrEqual(0.5 - 1e-6)
        backCount += 1
      }
    }

    expect(frontCount).toBeGreaterThan(40)
    expect(backCount).toBeGreaterThan(40)
  })

  test('drops the front of a V neck', () => {
    const crew = createTeeMesh({ neck: 'crew' })
    const vee = createTeeMesh({ neck: 'v' })
    const crewBody = bodyMesh({ group: crew })
    const veeBody = bodyMesh({ group: vee })

    if (!(crewBody instanceof Mesh) || !(veeBody instanceof Mesh)) {
      throw new Error('missing body')
    }

    let crewFront = Number.NEGATIVE_INFINITY
    let veeFront = Number.NEGATIVE_INFINITY
    const crewPos = crewBody.geometry.attributes.position
    const veePos = veeBody.geometry.attributes.position

    for (let index = 0; index < crewPos.count; index += 1) {
      if (Math.abs(crewPos.getX(index)) < 0.03 && crewPos.getZ(index) > 0.02) {
        crewFront = Math.max(crewFront, crewPos.getY(index))
      }
    }

    for (let index = 0; index < veePos.count; index += 1) {
      if (Math.abs(veePos.getX(index)) < 0.03 && veePos.getZ(index) > 0.02) {
        veeFront = Math.max(veeFront, veePos.getY(index))
      }
    }

    expect(veeFront).toBeLessThan(crewFront - 0.02)
  })
})

describe('isHouseForm', () => {
  test('names only the seated clothing we author', () => {
    expect(isHouseForm({ garmentId: 'tee' })).toBe(true)
    expect(isHouseForm({ garmentId: 'gown' })).toBe(false)
    expect(isHouseForm({ garmentId: 'slip' })).toBe(false)
  })
})
