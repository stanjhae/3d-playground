import { describe, expect, test } from 'vitest'

import { Matrix4, type Mesh, Vector3 } from 'three'

import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR_MEASUREMENTS,
  getAvatarById,
  listAvatars,
  nextAvatarSelection,
} from './avatars'
import { createProceduralAvatar, type AvatarMeasurements } from './avatar-geometry'
import { armAxis, BODY_LANDMARKS } from './cloth/colliders'
import { deepestClip, fitGarment, type FitPart } from './garment-fit'
import { SLEEVE_PIVOT, createTeeMesh } from './tee-geometry'
import { TEE_CREW_SHORT_V6 } from './templates/tee-v6'

describe('avatars', () => {
  test('lists house avatar presets', () => {
    const avatars = listAvatars()

    expect(avatars.length).toBeGreaterThanOrEqual(4)
    expect(listAvatars({ filter: 'athletic' }).length).toBeGreaterThan(0)
    expect(getAvatarById({ avatarId: avatars[0]?.id })?.label).toBe(
      avatars[0]?.label,
    )
    expect(DEFAULT_AVATAR_MEASUREMENTS.height).toBe(180)
  })

  test('builds a procedural mannequin from measurements', () => {
    const tall = createProceduralAvatar({
      measurements: { height: 190, chest: 110, waist: 88 },
    })
    const compact = createProceduralAvatar({
      measurements: { height: 160, chest: 90, waist: 70 },
    })

    expect(tall.root.children.length).toBeGreaterThan(3)
    expect(tall.heightScale).toBeGreaterThan(compact.heightScale)
    expect(tall.garment.scale[1]).toBeGreaterThan(compact.garment.scale[1])
  })

  test('every preset seats the tee shoulder on the mannequin shoulder', () => {
    for (const preset of AVATAR_PRESETS) {
      const avatar = createProceduralAvatar({
        measurements: {
          height: preset.heightCm,
          chest: preset.chestCm,
          waist: preset.waistCm,
        },
      })
      const teeShoulderY =
        avatar.garment.position[1] + SLEEVE_PIVOT.y * avatar.garment.scale[1]

      expect(teeShoulderY).toBeCloseTo(avatar.shoulderY, 5)
      expect(avatar.garment.scale).toEqual(avatar.root.scale.toArray())
    }
  })

  test('worn sleeves hang from the shoulder pivot over the arms', () => {
    const tee = createTeeMesh({ sleeve: 'short', pose: 'worn' })
    const sleeve = tee.getObjectByName('body-sleeve-right') as Mesh
    sleeve.geometry.computeBoundingBox()
    const box = sleeve.geometry.boundingBox!

    expect(box.max.y).toBeLessThan(SLEEVE_PIVOT.y + 0.04)
    expect(box.min.y).toBeLessThan(SLEEVE_PIVOT.y - 0.1)
    expect(box.min.x).toBeGreaterThan(SLEEVE_PIVOT.x - 0.1)
  })

  test('re-tapping the chosen avatar goes back to the tee alone', () => {
    expect(
      nextAvatarSelection({ currentId: 'atelier-tall', clickedId: 'atelier-tall' }),
    ).toBeNull()
    expect(
      nextAvatarSelection({ currentId: 'atelier-tall', clickedId: 'atelier-soft' }),
    ).toBe('atelier-soft')
  })
})

describe('male and female mannequins differ (tester feedback)', () => {
  test('Tall · Male and Tall · Female build visibly different bodies', () => {
    const male = AVATAR_PRESETS.find((avatar) => avatar.label === 'Tall · Male')!
    const female = AVATAR_PRESETS.find((avatar) => avatar.label === 'Tall · Female')!
    const build = (avatar: typeof male) =>
      createProceduralAvatar({
        measurements: { height: avatar.heightCm, chest: avatar.chestCm, waist: avatar.waistCm, hip: avatar.hipCm, build: avatar.build },
      }).root
    const part = (root: ReturnType<typeof build>, name: string) => root.getObjectByName(name)

    const maleRoot = build(male)
    const femaleRoot = build(female)

    expect(part(femaleRoot, 'avatar-bust-left')).toBeDefined()
    expect(part(maleRoot, 'avatar-bust-left')).toBeUndefined()
    // Broader shoulders on the male, wider hips (relative to the chest) on the female.
    expect(part(maleRoot, 'avatar-shoulders')!.scale.y).toBeGreaterThan(part(femaleRoot, 'avatar-shoulders')!.scale.y)
    expect(part(femaleRoot, 'avatar-hips')!.scale.x).toBeGreaterThan(part(maleRoot, 'avatar-hips')!.scale.x)
  })
})

describe('realGarmentSeat', () => {
  type Vec3 = readonly [number, number, number]

  /** Where a point of a real model lands on the avatar: the mount, then the seat. */
  async function worn({ point, measurements = DEFAULT_AVATAR_MEASUREMENTS }: { point: Vec3; measurements?: AvatarMeasurements }) {
    const { realGarmentSeat } = await import('./avatar-geometry')
    const { garment } = createProceduralAvatar({ measurements })
    const seat = realGarmentSeat()
    return [0, 1, 2].map(
      (axis) => garment.position[axis]! + garment.scale[axis]! * (seat.position[axis]! + point[axis]! * seat.scale),
    ) as [number, number, number]
  }

  test('the tee (@6) sits on the body’s landmarks: collar on the neck, hem at the hips, sleeves at the shoulders', async () => {
    const bounds = TEE_CREW_SHORT_V6.geometry.bounds!
    const neckTop = BODY_LANDMARKS.neckY + 0.18
    const [, collar] = await worn({ point: [0, bounds.max[1], 0] })
    const [, hem] = await worn({ point: [0, bounds.min[1], 0] })

    // The collar rides the neck, below its top (not above it, as the old 1.39× seat put it).
    expect(collar).toBeGreaterThan(BODY_LANDMARKS.neckY)
    expect(collar).toBeLessThan(neckTop)
    // The hem falls at the hips, not mid-thigh.
    expect(Math.abs(hem - BODY_LANDMARKS.hipY)).toBeLessThan(0.05)

    for (const region of Object.values(TEE_CREW_SHORT_V6.regions)) {
      if (region.renderPanel !== 'left' && region.renderPanel !== 'right') {
        continue
      }
      const [x, y] = await worn({ point: region.center! })
      // Each sleeve hangs from the shoulder seam, at the shoulder's width.
      expect(Math.abs(Math.abs(x) - BODY_LANDMARKS.shoulderX), region.label).toBeLessThan(0.03)
      expect(y, region.label).toBeLessThan(BODY_LANDMARKS.shoulderY)
      expect(y, region.label).toBeGreaterThan(BODY_LANDMARKS.shoulderY - 0.15)
    }
  })

  test('a bigger preset carries the garment with the body: the collar follows the height, the sleeves the chest', async () => {
    const bounds = TEE_CREW_SHORT_V6.geometry.bounds!
    const tall = { height: 198, chest: 112, waist: 90 }
    const [, baseCollar] = await worn({ point: [0, bounds.max[1], 0] })
    const [, tallCollar] = await worn({ point: [0, bounds.max[1], 0], measurements: tall })
    const [baseEdge] = await worn({ point: [bounds.max[0], 1.3, 0] })
    const [tallEdge] = await worn({ point: [bounds.max[0], 1.3, 0], measurements: tall })

    expect(tallCollar / baseCollar).toBeCloseTo(198 / 180, 6)
    expect(tallEdge / baseEdge).toBeCloseTo(112 / 102, 6)
  })

  test('every real model keeps its own frame on the body (each is modelled on the mannequin)', async () => {
    const { templateForGarment } = await import('./template-manifest')
    const { GARMENT_IDS } = await import('./design-schema')
    const manifests = GARMENT_IDS.map((garmentId) => templateForGarment({ garmentId })).filter((manifest) => manifest !== undefined)
    expect(manifests.length).toBeGreaterThan(10)
    for (const manifest of manifests) {
      const bounds = manifest.geometry.bounds
      if (!bounds) {
        continue
      }
      for (const corner of [bounds.min, bounds.max]) {
        const at = await worn({ point: corner })
        expect(at[0], manifest.id).toBeCloseTo(corner[0], 6)
        expect(at[1], manifest.id).toBeCloseTo(corner[1], 6)
        expect(at[2], manifest.id).toBeCloseTo(corner[2], 6)
      }
    }
  })
})

describe('try-on fit: the tee (@6) on every figure (founder: it didn’t sit naturally)', () => {
  /** The tee's meshes, in the body's frame (where every real model is modelled). */
  async function teeParts(): Promise<FitPart[]> {
    const { NodeIO } = await import('@gltf-transform/core')
    const { KHRDracoMeshCompression } = await import('@gltf-transform/extensions')
    const { readFileSync } = (await import(
      // @ts-expect-error Node built-in
      'node:fs'
    )) as { readFileSync: (path: string) => Uint8Array }
    // @ts-expect-error no types for the Draco decoder
    const draco3d = (await import('draco3dgltf')) as { default: { createDecoderModule: () => Promise<unknown> } }
    const io = new NodeIO()
      .registerExtensions([KHRDracoMeshCompression])
      .registerDependencies({ 'draco3d.decoder': await draco3d.default.createDecoderModule() })
    const document = await io.readBinary(readFileSync(`public${TEE_CREW_SHORT_V6.geometry.file}`))
    const parts: FitPart[] = []
    const point = new Vector3()

    for (const node of document.getRoot().listNodes()) {
      const matrix = new Matrix4().fromArray(node.getWorldMatrix() as number[])
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const source = primitive.getAttribute('POSITION')!.getArray()!
        const positions = new Float32Array(source.length)
        for (let at = 0; at < source.length; at += 3) {
          point.set(source[at]!, source[at + 1]!, source[at + 2]!).applyMatrix4(matrix).toArray(positions, at)
        }
        parts.push({ name: node.getName(), positions })
      }
    }

    return parts
  }

  const figures = AVATAR_PRESETS.map((preset) => ({
    label: preset.label,
    measurements: { height: preset.heightCm, chest: preset.chestCm, waist: preset.waistCm, hip: preset.hipCm, build: preset.build } as AvatarMeasurements,
  }))

  test('rigid, the tee sinks into every figure: the torso shows through its sides', async () => {
    const parts = await teeParts()
    for (const { label, measurements } of figures) {
      const { outer } = fitGarment({ measurements, parts })
      expect(deepestClip({ measurements, parts, outer }).depth, label).toBeGreaterThan(0.02)
    }
  })

  test('fitted, no outer cloth is inside the body, on any figure', async () => {
    const parts = await teeParts()
    for (const { label, measurements } of figures) {
      const fitted = fitGarment({ measurements, parts })
      const worn = parts.map((part, index) => ({ name: part.name, positions: fitted.positions[index]! }))
      const clip = deepestClip({ measurements, parts: worn, outer: fitted.outer })
      expect(clip.depth, `${label}: ${clip.part} at ${clip.at.map((value) => value.toFixed(3))}`).toBe(0)
      // The outer surface is most of the cloth (a seam allowance folds in; the cloth doesn't).
      const outerShare = fitted.outer.reduce((sum, flags) => sum + flags.reduce((count, flag) => count + flag, 0), 0) / fitted.outer.reduce((sum, flags) => sum + flags.length, 0)
      expect(outerShare, label).toBeGreaterThan(0.45)
    }
  })

  test('fitted, the landmarks hold: collar on the neck, hem at the hips, shoulder seam at the shoulder, sleeves round the arms', async () => {
    const parts = await teeParts()
    const named = (list: FitPart[], name: string) => list.find((part) => part.name === name)!.positions
    const extent = (positions: ArrayLike<number>, axis: number, pick: (a: number, b: number) => number, start: number) => {
      let value = start
      for (let at = axis; at < positions.length; at += 3) value = pick(value, positions[at]!)
      return value
    }

    // Each armhole seam's top: the highest sleeve vertex sewn to the body.
    const rigidSleeves = named(parts, 'body-sleeves')
    const rigidBody = [named(parts, 'body-front'), named(parts, 'body-back')]
    const sewn = (at: number) =>
      rigidBody.some((positions) => {
        for (let other = 0; other < positions.length; other += 3) {
          const gap = Math.hypot(positions[other]! - rigidSleeves[at]!, positions[other + 1]! - rigidSleeves[at + 1]!, positions[other + 2]! - rigidSleeves[at + 2]!)
          if (gap < 0.006) return true
        }
        return false
      })
    const byHeight = Array.from({ length: rigidSleeves.length / 3 }, (_, vertex) => vertex * 3).sort((a, b) => rigidSleeves[b + 1]! - rigidSleeves[a + 1]!)
    const seamTops = [-1, 1].map((sign) => byHeight.find((at) => Math.sign(rigidSleeves[at]!) === sign && sewn(at))!)

    for (const { label, measurements } of figures) {
      const fitted = fitGarment({ measurements, parts })
      const worn = parts.map((part, index) => ({ name: part.name, positions: fitted.positions[index]! }))
      const collar = named(worn, 'body-collar')
      const body = [named(worn, 'body-front'), named(worn, 'body-back')]
      const sleeves = named(worn, 'body-sleeves')

      // The collar is untouched: it rides the neck, below its top.
      expect(collar, label).toEqual(named(parts, 'body-collar'))
      expect(extent(collar, 1, Math.max, -Infinity), label).toBeGreaterThan(BODY_LANDMARKS.neckY)
      expect(extent(collar, 1, Math.max, -Infinity), label).toBeLessThan(BODY_LANDMARKS.neckY + 0.18)
      // The hem falls at the hips.
      const hem = Math.min(...body.map((positions) => extent(positions, 1, Math.min, Infinity)))
      expect(Math.abs(hem - BODY_LANDMARKS.hipY), label).toBeLessThan(0.05)

      // The shoulder seam (the armhole seam's top, where sleeve and body meet) is at the
      // shoulder's width, where the rigid tee had it.
      for (const at of seamTops) {
        expect(Math.abs(Math.abs(sleeves[at]!) - BODY_LANDMARKS.shoulderX), label).toBeLessThan(0.03)
        expect(sleeves[at + 1]!, label).toBeGreaterThan(BODY_LANDMARKS.shoulderY)
        expect(sleeves[at]!, label).toBe(rigidSleeves[at]!)
      }

      // Down the arm, the sleeve's cross-section is centred on it and wraps all round it.
      expectSleeveRoundArm({ sleeves, side: 'left', label })
    }
  })

  // The @6 bake left its right sleeve hanging behind the arm (it's all
  // behind the arm's centre line); the @7 re-bake makes the sleeves
  // symmetric. A fit eases cloth out; it doesn't move a sleeve onto an arm.
  test.fails('@6: the right sleeve wraps round the right arm (it hangs behind it until the @7 re-bake)', async () => {
    const parts = await teeParts()
    const { measurements } = figures[0]!
    const fitted = fitGarment({ measurements, parts })
    const sleeves = fitted.positions[parts.findIndex((part) => part.name === 'body-sleeves')]!
    expectSleeveRoundArm({ sleeves, side: 'right', label: figures[0]!.label })
  })
})

/** Slices a sleeve square to the arm, a few places down it, and checks the arm is inside each slice. */
function expectSleeveRoundArm({ sleeves, side, label }: { sleeves: ArrayLike<number>; side: 'left' | 'right'; label: string }) {
  const arm = armAxis(side)
  const origin = new Vector3(...arm.origin)
  const dir = new Vector3(...arm.dir)
  const out = new Vector3(...arm.out)
  const point = new Vector3()

  // From below the armhole to above the hem (a short sleeve ends ~13 cm down the arm).
  for (const t of [0.06, 0.09, 0.12]) {
    const slice: Vector3[] = []
    for (let at = 0; at < sleeves.length; at += 3) {
      point.fromArray(sleeves as number[], at).sub(origin)
      const along = point.dot(dir)
      if (Math.abs(along - t) < 0.006 && Math.sign(sleeves[at]!) === Math.sign(out.x)) {
        slice.push(point.clone().addScaledVector(dir, -along))
      }
    }

    const where = `${label} ${side} sleeve, ${t * 100} cm down the arm`
    expect(slice.length, where).toBeGreaterThan(8)
    const centre = slice.reduce((sum, entry) => sum.add(entry), new Vector3()).divideScalar(slice.length)
    expect(centre.length(), where).toBeLessThan(0.035)
    // Cloth outside and inside the arm, in front of it and behind it.
    expect(slice.some((entry) => entry.dot(out) > 0.03) && slice.some((entry) => entry.dot(out) < -0.03), where).toBe(true)
    expect(slice.some((entry) => entry.z > 0.03) && slice.some((entry) => entry.z < -0.03), where).toBe(true)
  }
}
