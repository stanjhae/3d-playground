import { BoxGeometry, Mesh } from 'three'
import { describe, expect, test } from 'vitest'

import { uvToPanelPoint } from './panel-uv'
import { TORSO_V0, createTeeMesh, isHouseForm } from './tee-geometry'

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

  test('crop shortens the hem and long sleeve reaches further', () => {
    const longHem = createTeeMesh({ hem: 'long', sleeve: 'short' })
    const crop = createTeeMesh({ hem: 'crop', sleeve: 'long' })
    const longBody = bodyMesh({ group: longHem })
    const cropBody = bodyMesh({ group: crop })

    if (!(longBody instanceof Mesh) || !(cropBody instanceof Mesh)) {
      throw new Error('missing body')
    }

    let longMin = Number.POSITIVE_INFINITY
    let cropMin = Number.POSITIVE_INFINITY
    const longPos = longBody.geometry.attributes.position
    const cropPos = cropBody.geometry.attributes.position

    for (let index = 0; index < longPos.count; index += 1) {
      longMin = Math.min(longMin, longPos.getY(index))
    }

    for (let index = 0; index < cropPos.count; index += 1) {
      cropMin = Math.min(cropMin, cropPos.getY(index))
    }

    expect(cropMin).toBeGreaterThan(longMin + 0.2)

    const shortSleeve = longHem.children.find(
      (child) => child.name === 'body-sleeve-left' && child instanceof Mesh,
    )
    const longSleeve = crop.children.find(
      (child) => child.name === 'body-sleeve-left' && child instanceof Mesh,
    )

    if (!(shortSleeve instanceof Mesh) || !(longSleeve instanceof Mesh)) {
      throw new Error('missing sleeve')
    }

    let shortReach = 0
    let longReach = 0
    const shortPos = shortSleeve.geometry.attributes.position
    const longPosSleeve = longSleeve.geometry.attributes.position

    for (let index = 0; index < shortPos.count; index += 1) {
      shortReach = Math.max(shortReach, Math.abs(shortPos.getX(index)))
    }

    for (let index = 0; index < longPosSleeve.count; index += 1) {
      longReach = Math.max(longReach, Math.abs(longPosSleeve.getX(index)))
    }

    expect(longReach).toBeGreaterThan(shortReach + 0.08)
  })

  test('a sleeve hit is not a chest hit', () => {
    const tee = createTeeMesh({ sleeve: 'short' })
    const sleeve = tee.children.find(
      (child) => child.name === 'body-sleeve-left' && child instanceof Mesh,
    )
    const body = bodyMesh({ group: tee })

    if (!(sleeve instanceof Mesh) || !(body instanceof Mesh)) {
      throw new Error('missing cloth')
    }

    const sleeveUv = sleeve.geometry.attributes.uv
    const bodyUv = body.geometry.attributes.uv
    let sleeveHits = 0
    let bodyHits = 0

    for (let index = 0; index < sleeveUv.count; index += 1) {
      const hit = uvToPanelPoint({
        u: sleeveUv.getX(index),
        v: sleeveUv.getY(index),
      })

      expect(sleeveUv.getY(index)).toBeLessThanOrEqual(TORSO_V0 + 1e-6)
      expect(hit?.panel).toBe('left')
      sleeveHits += 1
    }

    for (let index = 0; index < bodyUv.count; index += 1) {
      const hit = uvToPanelPoint({
        u: bodyUv.getX(index),
        v: bodyUv.getY(index),
      })

      expect(bodyUv.getY(index)).toBeGreaterThanOrEqual(TORSO_V0 - 1e-6)
      expect(hit?.panel === 'left' || hit?.panel === 'right').toBe(false)
      bodyHits += 1
    }

    expect(sleeveHits).toBeGreaterThan(20)
    expect(bodyHits).toBeGreaterThan(40)
  })
})

describe('isHouseForm', () => {
  test('names only the seated clothing we author', () => {
    expect(isHouseForm({ garmentId: 'tee' })).toBe(true)
    expect(isHouseForm({ garmentId: 'gown' })).toBe(false)
    expect(isHouseForm({ garmentId: 'slip' })).toBe(false)
  })
})
