import { type BufferGeometry, Box3, Mesh, type Object3D } from 'three'
import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { DEFAULT_PANEL_UV } from './panel-uv'
import { createTeeMesh } from './tee-geometry'
import { TEE_CREW_SHORT_V1, resolveTemplate } from './template-manifest'

const tee = createTeeMesh(TEE_CREW_SHORT_V1.geometry.structural)
const regions = TEE_CREW_SHORT_V1.regions

function meshNamed({ name }: { name: string }) {
  // The group is also named "body", so look for the mesh specifically.
  let found: Object3D | undefined

  tee.traverse((child) => {
    if (!found && child instanceof Mesh && child.name === name) {
      found = child
    }
  })

  if (!(found instanceof Mesh)) {
    throw new Error(`no mesh ${name}`)
  }

  return found.geometry as BufferGeometry
}

function uvBounds({ geometry }: { geometry: BufferGeometry }) {
  const uv = geometry.attributes.uv
  let u0 = Infinity
  let v0 = Infinity
  let u1 = -Infinity
  let v1 = -Infinity

  for (let index = 0; index < (uv?.count ?? 0); index += 1) {
    u0 = Math.min(u0, uv!.getX(index))
    u1 = Math.max(u1, uv!.getX(index))
    v0 = Math.min(v0, uv!.getY(index))
    v1 = Math.max(v1, uv!.getY(index))
  }

  return { u0, v0, u1, v1 }
}

/** Body vertices sampled around the widest chest ring. */
function bodyVertex({ pick }: { pick: (x: number, z: number) => number }) {
  const geometry = meshNamed({ name: 'body' })
  const position = geometry.attributes.position!
  const uv = geometry.attributes.uv!
  let best = -Infinity
  let result = { x: 0, z: 0, u: 0 }

  for (let index = 0; index < position.count; index += 1) {
    const score = pick(position.getX(index), position.getZ(index))

    if (score > best) {
      best = score
      result = { x: position.getX(index), z: position.getZ(index), u: uv.getX(index) }
    }
  }

  return result
}

async function sha256File({ path }: { path: string }) {
  const { readFileSync } = (await import(
    // @ts-expect-error Node built-in; tests run in Vitest, not the browser bundle
    'node:fs'
  )) as { readFileSync: (filePath: string) => Uint8Array<ArrayBuffer> }
  const { resolve } = (await import(
    // @ts-expect-error Node built-in
    'node:path'
  )) as { resolve: (...parts: string[]) => string }
  const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
  const digest = await crypto.subtle.digest('SHA-256', readFileSync(resolve(cwd, path)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('tee-crew-short@1 manifest', () => {
  test('pins the shipped geometry file (bump the version if this changes)', async () => {
    expect(await sha256File({ path: `public${TEE_CREW_SHORT_V1.geometry.file}` })).toBe(
      TEE_CREW_SHORT_V1.geometry.sha256,
    )
  })

  test('each region names the render panel whose UV rectangle it uses', () => {
    for (const region of Object.values(regions)) {
      expect(region.uv).toEqual(DEFAULT_PANEL_UV[region.renderPanel])
    }
  })

  test('each region mesh samples only its own rectangle', () => {
    for (const region of [regions.left, regions.right]) {
      const bounds = uvBounds({ geometry: meshNamed({ name: region.mesh }) })

      expect(bounds.u0).toBeGreaterThanOrEqual(region.uv.u0 - 1e-6)
      expect(bounds.u1).toBeLessThanOrEqual(region.uv.u1 + 1e-6)
      expect(bounds.v1).toBeLessThanOrEqual(region.uv.v1 + 1e-6)
    }
  })

  test('the front faces +z, so the wearer’s left is +x', () => {
    const chest = bodyVertex({ pick: (_x, z) => z })

    expect(chest.u).toBeCloseTo(0.25, 2)
    expect(chest.u).toBeGreaterThanOrEqual(regions.front.uv.u0)
    expect(chest.u).toBeLessThanOrEqual(regions.front.uv.u1)
  })

  test('sleeves are wearer-oriented and independent', () => {
    const left = new Box3().setFromBufferAttribute(
      meshNamed({ name: regions.left.mesh }).attributes.position as never,
    )
    const right = new Box3().setFromBufferAttribute(
      meshNamed({ name: regions.right.mesh }).attributes.position as never,
    )

    expect(left.min.x).toBeGreaterThan(0)
    expect(right.max.x).toBeLessThan(0)
    expect(regions.left.uv.u0).toBeGreaterThanOrEqual(regions.right.uv.u1)
  })

  test('panel x runs toward the wearer’s left on both front and back', () => {
    const wearerLeft = bodyVertex({ pick: (x) => x })
    const wearerRight = bodyVertex({ pick: (x) => -x })

    // +x side sits at the right edge of front (u 0.5) and back (u 1.0).
    expect([0.5, 1]).toContainEqual(Number(wearerLeft.u.toFixed(3)))
    expect(Number(wearerRight.u.toFixed(3))).toBeCloseTo(0, 3)
    expect(regions.front.landmarks.wearerLeftSideSeam?.x).toBe(1)
    expect(regions.back.landmarks.wearerLeftSideSeam?.x).toBe(1)
  })

  test('torso landmark heights come from the body rings', () => {
    const ringToPanelY = (ringY: number) => Number(((ringY - 0.5) / 0.81).toFixed(3))

    expect(regions.front.landmarks.waistCentre?.y).toBe(ringToPanelY(0.76))
    expect(regions.front.landmarks.chestCentre?.y).toBe(ringToPanelY(1.06))
    expect(regions.front.landmarks.shoulderLine?.y).toBe(ringToPanelY(1.22))
  })

  test('the collar overlap note matches the collar UVs', () => {
    const collar = uvBounds({ geometry: meshNamed({ name: 'body-collar' }) })
    const start = (collar.v0 - regions.front.uv.v0) / (regions.front.uv.v1 - regions.front.uv.v0)

    expect(Number(start.toFixed(3))).toBe(0.861)
    expect(regions.front.notes.join(' ')).toContain('0.861')
  })

  test('every landmark lies inside its panel', () => {
    for (const region of Object.values(regions)) {
      for (const point of Object.values(region.landmarks)) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(1)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('resolveTemplate', () => {
  test('resolves the template new documents pin', () => {
    const { template } = createEmptyCanonicalDocument()

    expect(resolveTemplate(template)).toEqual({ ok: true, manifest: TEE_CREW_SHORT_V1 })
  })

  test('refuses unknown templates and versions explicitly', () => {
    expect(resolveTemplate({ id: 'hoodie', version: 1 })).toMatchObject({
      ok: false,
      reason: 'unknown-template',
    })
    expect(resolveTemplate({ id: 'tee-crew-short', version: 2 })).toMatchObject({
      ok: false,
      reason: 'unsupported-version',
    })
  })
})
