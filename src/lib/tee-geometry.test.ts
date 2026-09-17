import { Mesh } from 'three'
import { describe, expect, test } from 'vitest'

import { createTeeMesh } from './tee-geometry'

describe('createTeeMesh', () => {
  test('keeps the body in the front panel after it is seated', () => {
    const tee = createTeeMesh({ neck: 'crew' })
    const body = tee.children.find(
      (child) => child.name === 'body' && child instanceof Mesh,
    )

    expect(body).toBeInstanceOf(Mesh)
    if (!(body instanceof Mesh)) {
      return
    }

    const uv = body.geometry.attributes.uv

    expect(uv).toBeTruthy()

    for (let index = 0; index < (uv?.count ?? 0); index += 1) {
      const u = uv.getX(index)
      const v = uv.getY(index)

      expect(u).toBeGreaterThanOrEqual(-1e-6)
      expect(u).toBeLessThanOrEqual(0.5 + 1e-6)
      expect(v).toBeGreaterThanOrEqual(-1e-6)
      expect(v).toBeLessThanOrEqual(1 + 1e-6)
    }
  })
})
