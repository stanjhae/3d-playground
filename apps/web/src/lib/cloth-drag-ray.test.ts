import { BufferAttribute, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'

import { anchorFromHit, clothDragStep } from './cloth-drag-ray'
import type { PanelId } from './design-document'
import { DEFAULT_PANEL_UV, type UvRect } from './panel-uv'

/**
 * A flat stand-in for the cloth, facing +z: a front panel 1 m square at the
 * origin, a sleeve joined to its right edge, and a back panel 0.3 m behind,
 * showing above the front (as the back does through a collar).
 */
function piece({ panel, x, y, z }: { panel: PanelId; x: number; y: number; z: number }) {
  const geometry = new PlaneGeometry(1, 1)
  const rect: UvRect = DEFAULT_PANEL_UV[panel]
  const uv = geometry.getAttribute('uv')
  const uv1 = new Float32Array(uv.count * 2)

  for (let index = 0; index < uv.count; index += 1) {
    uv1[index * 2] = rect.u0 + uv.getX(index) * (rect.u1 - rect.u0)
    uv1[index * 2 + 1] = rect.v0 + uv.getY(index) * (rect.v1 - rect.v0)
  }

  geometry.setAttribute('uv1', new BufferAttribute(uv1, 2))
  const mesh = new Mesh(geometry, new MeshBasicMaterial())
  mesh.position.set(x, y, z)
  mesh.updateMatrixWorld()
  return mesh
}

const cloth = [piece({ panel: 'front', x: 0, y: 0, z: 0 }), piece({ panel: 'left', x: 1, y: 0, z: 0 }), piece({ panel: 'back', x: 0, y: 1, z: -0.3 })]

function cast({ x, y }: { x: number; y: number }) {
  const raycaster = new Raycaster(new Vector3(x, y, 5), new Vector3(0, 0, -1))
  return { hits: raycaster.intersectObjects(cloth, false), ray: raycaster.ray }
}

function stepAt({ x, y, panel = 'front', from }: { x: number; y: number; panel?: PanelId; from: { x: number; y: number } }) {
  const start = cast(from)
  const anchor = anchorFromHit({ hit: start.hits[0]!, printUv: true })
  return clothDragStep({ ...cast({ x, y }), panel, anchor, printUv: true, rects: DEFAULT_PANEL_UV })
}

describe('a drag on the cloth', () => {
  test('follows the pointer on its own panel', () => {
    const step = stepAt({ x: 0.25, y: 0, from: { x: 0, y: 0 } })

    expect(step.kind).toBe('same')
    expect(step.kind === 'same' && step.x).toBeCloseTo(0.75)
    expect(step.kind === 'same' && step.y).toBeCloseTo(0.5)
  })

  test('keeps following off the cloth, on the panel plane, past its edge', () => {
    const step = stepAt({ x: -0.9, y: -0.2, from: { x: -0.4, y: 0 } })

    expect(step.kind).toBe('same')
    // 0.4 m past the left edge of a 1 m panel.
    expect(step.kind === 'same' && step.x).toBeCloseTo(-0.4)
    expect(step.kind === 'same' && step.y).toBeCloseTo(0.3)
  })

  test('crosses a seam onto the panel joined to it', () => {
    const step = stepAt({ x: 0.52, y: 0.1, from: { x: 0.48, y: 0.1 } })

    expect(step).toMatchObject({ kind: 'cross', panel: 'left' })
    expect(step.kind === 'cross' && step.x).toBeCloseTo(0.02)
    expect(step.kind === 'cross' && step.y).toBeCloseTo(0.6)
  })

  test('does not jump to a panel far behind; it carries on the plane instead', () => {
    const step = stepAt({ x: 0, y: 0.7, from: { x: 0, y: 0.45 } })

    expect(step.kind).toBe('same')
    expect(step.kind === 'same' && step.y).toBeCloseTo(1.2)
  })

  test('without an anchor, a miss does nothing', () => {
    const step = clothDragStep({ ...cast({ x: 5, y: 5 }), panel: 'front', anchor: null, printUv: true, rects: DEFAULT_PANEL_UV })
    expect(step).toEqual({ kind: 'none' })
  })
})
