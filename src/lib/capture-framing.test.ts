import { Mesh, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'

import {
  CAMERA_PRESET_POSITIONS,
  captureFov,
  STILL_FRAME,
  STUDIO_CAMERA,
} from './studio-camera'
import { createClothingMesh } from './tee-geometry'

/**
 * R04 #167: the garment is wholly inside the published still, with the
 * contract margin, for every captured preset and any canvas shape. The
 * still is the canvas centre-cropped to 4:5 (`frameStill`), so this
 * projects every garment vertex through the preset camera and applies
 * the same crop.
 */

const STILLS = ['front', 'threeQuarter', 'back'] as const
// Phone portrait, near-square, desktop studio, ultrawide.
const CANVAS_ASPECTS = [0.46, 0.8, 1, 1.6, 2.4]
const STILL_ASPECT = STILL_FRAME.width / STILL_FRAME.height

function garmentPoints({ pose }: { pose: 'flat' | 'worn' }) {
  const root = createClothingMesh({ pose })
  root.updateMatrixWorld(true)
  const points: Vector3[] = []

  root.traverse((node) => {
    if (node instanceof Mesh) {
      const position = node.geometry.attributes.position!

      for (let index = 0; index < position.count; index += 1) {
        points.push(new Vector3().fromBufferAttribute(position, index).applyMatrix4(node.matrixWorld))
      }
    }
  })

  return points
}

/** Garment bounds in still coordinates: [0, 1] across, top-left origin. */
function stillBounds({
  preset,
  canvasAspect,
  pose,
}: {
  preset: (typeof STILLS)[number]
  canvasAspect: number
  pose: 'flat' | 'worn'
}) {
  const camera = new PerspectiveCamera(
    captureFov({ aspect: canvasAspect }),
    canvasAspect,
    STUDIO_CAMERA.near,
    STUDIO_CAMERA.far,
  )
  const [x, y, z] = CAMERA_PRESET_POSITIONS[preset]
  camera.position.set(x, y, z)
  camera.lookAt(...STUDIO_CAMERA.target)
  camera.updateMatrixWorld(true)

  // frameStill's cover crop, in canvas NDC half-extents.
  const cropX = canvasAspect > STILL_ASPECT ? STILL_ASPECT / canvasAspect : 1
  const cropY = canvasAspect > STILL_ASPECT ? 1 : canvasAspect / STILL_ASPECT
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity

  for (const point of garmentPoints({ pose })) {
    const ndc = point.clone().project(camera)
    const x = (ndc.x / cropX + 1) / 2
    const y = (1 - ndc.y / cropY) / 2
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }

  return { left, right, top, bottom }
}

describe('published still framing (#167)', () => {
  test('the still is a 4:5 opaque frame', () => {
    expect(STILL_FRAME.width / STILL_FRAME.height).toBe(0.8)
    expect(STILL_FRAME.minMargin).toBeGreaterThan(0)
  })

  for (const pose of ['flat', 'worn'] as const) {
    for (const preset of STILLS) {
      test(`the ${pose} tee is wholly inside the ${preset} still at every canvas shape`, () => {
        for (const canvasAspect of CANVAS_ASPECTS) {
          const bounds = stillBounds({ preset, canvasAspect, pose })
          const margin = STILL_FRAME.minMargin

          expect(bounds.left, `left @ ${canvasAspect}`).toBeGreaterThanOrEqual(margin)
          expect(bounds.right, `right @ ${canvasAspect}`).toBeLessThanOrEqual(1 - margin)
          expect(bounds.top, `top @ ${canvasAspect}`).toBeGreaterThanOrEqual(margin)
          expect(bounds.bottom, `bottom @ ${canvasAspect}`).toBeLessThanOrEqual(1 - margin)
        }
      })
    }
  }

  test('every canvas shape gives the same still (capture fov compensates the crop)', () => {
    for (const preset of STILLS) {
      const reference = stillBounds({ preset, canvasAspect: STILL_ASPECT, pose: 'flat' })

      for (const canvasAspect of CANVAS_ASPECTS) {
        const bounds = stillBounds({ preset, canvasAspect, pose: 'flat' })
        expect(bounds.left).toBeCloseTo(reference.left, 6)
        expect(bounds.top).toBeCloseTo(reference.top, 6)
        expect(bounds.right).toBeCloseTo(reference.right, 6)
        expect(bounds.bottom).toBeCloseTo(reference.bottom, 6)
      }
    }
  })

  test('the garment is a readable size in the still, not a speck', () => {
    for (const preset of STILLS) {
      const { top, bottom } = stillBounds({ preset, canvasAspect: 1.6, pose: 'flat' })
      expect(bottom - top).toBeGreaterThan(0.3)
    }
  })

  test('studio views keep the studio fov; only portrait captures widen it', () => {
    expect(captureFov({ aspect: 1.6 })).toBe(STUDIO_CAMERA.fov)
    expect(captureFov({ aspect: 0.8 })).toBe(STUDIO_CAMERA.fov)
    expect(captureFov({ aspect: 0.46 })).toBeGreaterThan(STUDIO_CAMERA.fov)
  })
})
