import { NodeIO } from '@gltf-transform/core'
import { beforeAll, describe, expect, test } from 'vitest'

import { HOUSE_COPY } from '../house-copy'
import { TEE_CREW_SHORT_V5 } from '../templates/tee-v5'
import type { TemplateManifest } from '../template-manifest'
import { patternTemplateFor } from './templates'

/**
 * scripts/bake-pattern-glb.mjs (roadmap D0) on the tee recipe: the baked GLB
 * carries print UVs, and its manifest passes the checks a shipped real-model
 * template does (`templates/glb-templates.test.ts`). The Draco step runs
 * through the gltf-transform CLI (npx), so the test bakes uncompressed.
 */

type Node = {
  fs: {
    mkdtempSync: (prefix: string) => string
    readFileSync: { (path: string, encoding: 'utf8'): string; (path: string): Uint8Array<ArrayBuffer> }
    rmSync: (path: string, options: { recursive: boolean; force: boolean }) => void
  }
  os: { tmpdir: () => string }
  child: { execFileSync: (command: string, args: string[], options: { stdio: string }) => unknown }
}

async function node(): Promise<Node> {
  // Node built-ins; tests run in Vitest, not the browser bundle.
  // @ts-expect-error Node built-in
  const fs = (await import('node:fs')) as Node['fs']
  // @ts-expect-error Node built-in
  const os = (await import('node:os')) as Node['os']
  // @ts-expect-error Node built-in
  const child = (await import('node:child_process')) as Node['child']
  return { fs, os, child }
}

async function bake({ dir }: { dir: string }) {
  const { child, fs } = await node()
  const glb = `${dir}/tee.glb`
  const manifest = `${dir}/tee.ts`
  child.execFileSync(
    'node',
    ['scripts/bake-pattern-glb.mjs', '--template', 'tee-crew-short', '--version', '5', '--glb', glb, '--manifest', manifest, '--no-compress'],
    { stdio: 'pipe' },
  )
  const source = fs.readFileSync(manifest, 'utf8')
  return {
    bytes: fs.readFileSync(glb),
    source,
    manifest: JSON.parse(source.slice(source.indexOf('= {') + 2)) as TemplateManifest,
  }
}

async function sha256({ bytes }: { bytes: Uint8Array<ArrayBuffer> }) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('bake-pattern-glb: tee-crew-short@5 from its recipe', () => {
  let first: Awaited<ReturnType<typeof bake>>
  let second: Awaited<ReturnType<typeof bake>>

  beforeAll(async () => {
    const { fs, os } = await node()
    const dir = fs.mkdtempSync(`${os.tmpdir()}/bake-test-`)

    try {
      first = await bake({ dir: `${dir}` })
      fs.rmSync(`${dir}/tee.glb`, { recursive: false, force: true })
      second = await bake({ dir: `${dir}` })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)

  test('is deterministic: a re-bake gives identical bytes and the same manifest', () => {
    expect(second.bytes).toEqual(first.bytes)
    expect(second.source).toBe(first.source)
  })

  test('pins the GLB it wrote, and is the tee template it was baked for', async () => {
    const { manifest } = first
    expect(manifest.geometry.sha256).toBe(await sha256({ bytes: first.bytes }))
    expect(manifest.geometry.generator).toBe('scripts/bake-pattern-glb.mjs (tee-crew-short@5)')
    expect(manifest).toMatchObject({ id: 'tee-crew-short', version: 5, garmentId: 'tee', atlas: { width: 2048, height: 2048 } })
    expect(Object.keys(manifest.regions)).toEqual(Object.keys(TEE_CREW_SHORT_V5.regions))
  })

  test('every printing vertex has TEXCOORD_1 inside [0, 1] and inside its own region; the rest are unprinted', async () => {
    const document = await new NodeIO().readBinary(first.bytes)
    const rects = Object.values(first.manifest.regions).map((region) => region.uv)
    const nodes = document.getRoot().listNodes().filter((n) => n.getMesh())
    const counts = rects.map(() => 0)

    expect(nodes.map((n) => n.getName())).toEqual(['body-pattern'])

    for (const primitive of nodes[0]!.getMesh()!.listPrimitives()) {
      const printUv = primitive.getAttribute('TEXCOORD_1')
      expect(printUv).not.toBeNull()
      expect(primitive.getAttribute('TEXCOORD_0')).not.toBeNull()
      const uv = [0, 0]

      for (let index = 0; index < printUv!.getCount(); index += 1) {
        printUv!.getElement(index, uv)
        const [u, v] = uv as [number, number]

        if (u === -1 && v === -1) {
          continue
        }

        expect(u).toBeGreaterThanOrEqual(0)
        expect(u).toBeLessThanOrEqual(1)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
        const inside = rects.findIndex((rect) => u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6 && v >= rect.v0 - 1e-6 && v <= rect.v1 + 1e-6)
        expect(inside).toBeGreaterThanOrEqual(0)
        counts[inside] = counts[inside]! + 1
      }
    }

    // Every panel prints something.
    expect(counts.every((count) => count > 0)).toBe(true)
  })

  test('regions lie in [0, 1], never overlap, and keep the frames\' proportions', () => {
    const regions = Object.entries(first.manifest.regions)
    const frames = patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 5 })!.frames

    for (const [id, { uv, surface }] of regions) {
      for (const value of [uv.u0, uv.u1, uv.v0, uv.v1]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
      expect(uv.u1).toBeGreaterThan(uv.u0)
      expect(uv.v1).toBeGreaterThan(uv.v0)
      // One shared scale across the atlas, so each rectangle has its frame's shape.
      expect((uv.u1 - uv.u0) / (uv.v1 - uv.v0)).toBeCloseTo(frames[id]!.width / frames[id]!.height, 2)
      expect(surface!.panelAspect).toBeCloseTo(frames[id]!.width / frames[id]!.height, 5)
    }

    regions.forEach(([, a], i) =>
      regions.slice(i + 1).forEach(([, b]) => {
        expect(a.uv.u0 < b.uv.u1 && b.uv.u0 < a.uv.u1 && a.uv.v0 < b.uv.v1 && b.uv.v0 < a.uv.v1).toBe(false)
      }),
    )
  })

  test('routes panels like every shipped template: only the back mirrored, sleeves named for the wearer', () => {
    const { regions, geometry } = first.manifest

    for (const [id, region] of Object.entries(regions)) {
      expect(region.renderMirrorX, id).toBe(id === 'back')
      expect(region.renderPanel, id).toBe(TEE_CREW_SHORT_V5.regions[id]!.renderPanel)
      expect(region.mesh).toBe('body-pattern')
      for (let axis = 0; axis < 3; axis += 1) {
        expect(region.center![axis]).toBeGreaterThanOrEqual(geometry.bounds!.min[axis]!)
        expect(region.center![axis]).toBeLessThanOrEqual(geometry.bounds!.max[axis]!)
      }
    }

    // +x is the wearer's left.
    expect(regions.left!.center![0]).toBeGreaterThan(0)
    expect(regions.right!.center![0]).toBeLessThan(0)
    expect(regions.left!.label).toBe(HOUSE_COPY.wearerLeft)
    expect(regions.right!.label).toBe(HOUSE_COPY.wearerRight)
    // The front faces +z.
    expect(regions.front!.center![2]).toBeGreaterThan(regions.back!.center![2])
  })
})
