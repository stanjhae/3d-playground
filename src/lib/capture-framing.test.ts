import { Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'

import {
  CAMERA_PRESET_POSITIONS,
  captureFov,
  presetTarget,
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

// The whole garment fills these; the sleeve views frame one sleeve (#179).
const STILLS = ['front', 'threeQuarter', 'back'] as const
const SLEEVE_STILLS = [
  // Render panel `left` is the wearer's right sleeve, built at −x.
  { preset: 'left', mesh: 'body-sleeve-left', panelU: 0.25 },
  { preset: 'right', mesh: 'body-sleeve-right', panelU: 0.75 },
] as const
type StillPreset = (typeof STILLS)[number] | (typeof SLEEVE_STILLS)[number]['preset']
// Phone portrait, near-square, desktop studio, ultrawide.
const CANVAS_ASPECTS = [0.46, 0.8, 1, 1.6, 2.4]
const STILL_ASPECT = STILL_FRAME.width / STILL_FRAME.height

function garmentPoints({ pose, mesh }: { pose: 'flat' | 'worn'; mesh?: string }) {
  const root = createClothingMesh({ pose })
  root.updateMatrixWorld(true)
  const points: Vector3[] = []

  root.traverse((node) => {
    if (node instanceof Mesh && (!mesh || node.name === mesh)) {
      const position = node.geometry.attributes.position!

      for (let index = 0; index < position.count; index += 1) {
        points.push(new Vector3().fromBufferAttribute(position, index).applyMatrix4(node.matrixWorld))
      }
    }
  })

  return points
}

/** Garment bounds in still coordinates: [0, 1] across, top-left origin. */
function presetCamera({ preset, canvasAspect }: { preset: StillPreset; canvasAspect: number }) {
  const camera = new PerspectiveCamera(
    captureFov({ aspect: canvasAspect }),
    canvasAspect,
    STUDIO_CAMERA.near,
    STUDIO_CAMERA.far,
  )
  const [x, y, z] = CAMERA_PRESET_POSITIONS[preset]
  camera.position.set(x, y, z)
  camera.lookAt(...presetTarget({ preset }))
  camera.updateMatrixWorld(true)
  return camera
}

/** A world point in still coordinates: [0, 1] across, top-left origin. */
function toStill({ point, camera, canvasAspect }: { point: Vector3; camera: PerspectiveCamera; canvasAspect: number }) {
  // frameStill's cover crop, in canvas NDC half-extents.
  const cropX = canvasAspect > STILL_ASPECT ? STILL_ASPECT / canvasAspect : 1
  const cropY = canvasAspect > STILL_ASPECT ? 1 : canvasAspect / STILL_ASPECT
  const ndc = point.clone().project(camera)
  return { x: (ndc.x / cropX + 1) / 2, y: (1 - ndc.y / cropY) / 2 }
}

/** Garment (or one mesh's) bounds in still coordinates. */
function stillBounds({
  preset,
  canvasAspect,
  pose,
  mesh,
}: {
  preset: StillPreset
  canvasAspect: number
  pose: 'flat' | 'worn'
  mesh?: string
}) {
  const camera = presetCamera({ preset, canvasAspect })
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity

  for (const point of garmentPoints({ pose, mesh })) {
    const { x, y } = toStill({ point, camera, canvasAspect })
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }

  return { left, right, top, bottom }
}

/** The centre of a sleeve's print panel on the mesh: its world point and outward normal. */
function sleevePanelCentre({ pose, mesh, panelU }: { pose: 'flat' | 'worn'; mesh: string; panelU: number }) {
  const root = createClothingMesh({ pose })
  root.updateMatrixWorld(true)
  const sleeve = root.getObjectByName(mesh) as Mesh
  const geometry = sleeve.geometry.clone()
  geometry.computeVertexNormals()
  const position = geometry.attributes.position!
  const uv = geometry.attributes.uv!
  const normal = geometry.attributes.normal!
  // The panel spans v 0 → TORSO_V0 (0.28); its centre is v 0.14.
  let best = 0
  let bestDistance = Infinity

  for (let index = 0; index < uv.count; index += 1) {
    const distance = (uv.getX(index) - panelU) ** 2 + (uv.getY(index) - 0.14) ** 2

    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }

  return {
    root,
    point: new Vector3().fromBufferAttribute(position, best).applyMatrix4(sleeve.matrixWorld),
    normal: new Vector3().fromBufferAttribute(normal, best).transformDirection(sleeve.matrixWorld),
  }
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

  for (const pose of ['flat', 'worn'] as const) {
    for (const sleeve of SLEEVE_STILLS) {
      test(`the ${sleeve.preset} still frames the ${pose} ${sleeve.mesh} with its print facing the camera (#179)`, () => {
        for (const canvasAspect of CANVAS_ASPECTS) {
          const bounds = stillBounds({ preset: sleeve.preset, canvasAspect, pose, mesh: sleeve.mesh })
          const margin = STILL_FRAME.minMargin

          // The whole sleeve is inside the still, with the contract margin.
          expect(bounds.left, `left @ ${canvasAspect}`).toBeGreaterThanOrEqual(margin)
          expect(bounds.right, `right @ ${canvasAspect}`).toBeLessThanOrEqual(1 - margin)
          expect(bounds.top, `top @ ${canvasAspect}`).toBeGreaterThanOrEqual(margin)
          expect(bounds.bottom, `bottom @ ${canvasAspect}`).toBeLessThanOrEqual(1 - margin)
        }

        const { point, normal, root } = sleevePanelCentre({ pose, mesh: sleeve.mesh, panelU: sleeve.panelU })
        const camera = presetCamera({ preset: sleeve.preset, canvasAspect: 1.6 })
        const toCamera = camera.position.clone().sub(point).normalize()

        // The print's centre faces the camera rather than edge-on…
        expect(normal.dot(toCamera)).toBeGreaterThan(0.6)
        // …sits in the middle of the still…
        const centre = toStill({ point, camera, canvasAspect: 1.6 })
        expect(Math.abs(centre.x - 0.5)).toBeLessThan(0.2)
        expect(Math.abs(centre.y - 0.5)).toBeLessThan(0.2)
        // …and nothing else on the garment is in front of it.
        const ray = new Raycaster(camera.position, point.clone().sub(camera.position).normalize())
        const [first] = ray.intersectObject(root, true)
        expect(first?.object.name).toBe(sleeve.mesh)
        expect(first!.point.distanceTo(point)).toBeLessThan(0.02)

        // And it is big enough to read: the sleeve spans a fair part of the still.
        const size = stillBounds({ preset: sleeve.preset, canvasAspect: 1.6, pose, mesh: sleeve.mesh })
        expect(Math.max(size.right - size.left, size.bottom - size.top)).toBeGreaterThan(0.25)
      })
    }
  }

  test('the sleeve views keep the wearer-side naming: left looks at the −x sleeve, right at +x', () => {
    expect(presetTarget({ preset: 'left' })[0]).toBeLessThan(0)
    expect(presetTarget({ preset: 'right' })[0]).toBeGreaterThan(0)
    expect(CAMERA_PRESET_POSITIONS.left[0]).toBeLessThan(0)
    expect(CAMERA_PRESET_POSITIONS.right[0]).toBeGreaterThan(0)
    // Every other view still aims at the garment's centre.
    for (const preset of STILLS) {
      expect(presetTarget({ preset })).toEqual(STUDIO_CAMERA.target)
    }
  })

  test('studio views keep the studio fov; only portrait captures widen it', () => {
    expect(captureFov({ aspect: 1.6 })).toBe(STUDIO_CAMERA.fov)
    expect(captureFov({ aspect: 0.8 })).toBe(STUDIO_CAMERA.fov)
    expect(captureFov({ aspect: 0.46 })).toBeGreaterThan(STUDIO_CAMERA.fov)
  })
})
