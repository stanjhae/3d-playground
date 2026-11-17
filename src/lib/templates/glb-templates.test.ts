import { NodeIO } from '@gltf-transform/core'
import { KHRDracoMeshCompression } from '@gltf-transform/extensions'
import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument, validateCanonicalDocument } from '../canonical-document'
import { isCanonicalGarment } from '../concept-flags'
import { garmentCredit, garmentPanels } from '../garments'
import { HOUSE_COPY } from '../house-copy'
import { toRenderDocument } from '../render-projection'
import { resolveTemplate, TEE_CREW_SHORT_V3, templateForGarment, type TemplateManifest } from '../template-manifest'
import { HOODIE_V1 } from './hoodie'
import { TEE_CREW_SHORT_V4 } from './tee-v4'
import { TEE_CREW_SHORT_V5 } from './tee-v5'
import { TEE_CREW_SHORT_V6 } from './tee-v6'
import { COAT_V1 } from './coat'
import { GOWN_V1 } from './gown'
import { MIXED_V1 } from './mixed'
import { OVERALL_V1 } from './overall'
import { SLIP_V1 } from './slip'
import { SUIT_V1 } from './suit'
import { TAILORED_V1 } from './tailored'
import { VEST_V1 } from './vest'
import { CROP_V1 } from './crop'
import { DRESS_V1 } from './dress'
import { TROUSERS_V1 } from './trousers'

/** Node's file reader; tests run in Vitest, not the browser bundle. */
async function readBytes({ path }: { path: string }) {
  const { readFileSync } = (await import(
    // @ts-expect-error Node built-in
    'node:fs'
  )) as { readFileSync: (filePath: string) => Uint8Array<ArrayBuffer> }
  return readFileSync(path)
}

function glbJson({ bytes }: { bytes: Uint8Array }) {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    nodes: Array<{ name?: string; mesh?: number }>
    meshes: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>
  }
}

const TEMPLATES: Array<{ manifest: TemplateManifest; panels: string[] }> = [
  { manifest: HOODIE_V1, panels: ['front', 'back', 'left', 'right', 'hood-left', 'hood-right'] },
  { manifest: TEE_CREW_SHORT_V6, panels: ['front', 'back', 'left', 'right'] },
  { manifest: MIXED_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: COAT_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: SUIT_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: TAILORED_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: SLIP_V1, panels: ['front', 'back'] },
  { manifest: OVERALL_V1, panels: ['front', 'back'] },
  { manifest: GOWN_V1, panels: ['front', 'back'] },
  // Roadmap D1: baked from their pattern recipes.
  { manifest: VEST_V1, panels: ['front', 'back'] },
  { manifest: CROP_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: DRESS_V1, panels: ['front', 'back'] },
  { manifest: TROUSERS_V1, panels: ['front', 'back'] },
]

describe.each(TEMPLATES)('$manifest.id@$manifest.version (real model)', ({ manifest, panels }) => {
  const GLB = `public${manifest.geometry.file}`
  const garmentId = manifest.garmentId

  test('pins the exact GLB it was built from', async () => {
    const digest = await crypto.subtle.digest('SHA-256', await readBytes({ path: GLB }))
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    expect(sha256).toBe(manifest.geometry.sha256)
  })

  test('is its garment, current and resolvable', () => {
    expect(templateForGarment({ garmentId })).toBe(manifest)
    expect(resolveTemplate({ id: manifest.id, version: manifest.version })).toEqual({ ok: true, manifest })
    expect(isCanonicalGarment({ garmentId: garmentId as 'tee' })).toBe(true)
  })

  test('lays each panel in its own rectangle of the atlas', () => {
    const rects = Object.values(manifest.regions).map((region) => region.uv)

    for (const rect of rects) {
      expect(rect.u0).toBeGreaterThanOrEqual(0)
      expect(rect.v0).toBeGreaterThanOrEqual(0)
      expect(rect.u1).toBeLessThanOrEqual(1)
      expect(rect.v1).toBeLessThanOrEqual(1)
      expect(rect.u1).toBeGreaterThan(rect.u0)
      expect(rect.v1).toBeGreaterThan(rect.v0)
    }

    rects.forEach((a, i) =>
      rects.slice(i + 1).forEach((b) => {
        const overlaps = a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1
        expect(overlaps).toBe(false)
      }),
    )
  })

  test('keeps canonical x toward the wearer\'s left: only the back renders mirrored', () => {
    for (const [id, region] of Object.entries(manifest.regions)) {
      expect(region.renderMirrorX, id).toBe(id === 'back')
    }
  })

  test('names sleeves for the wearer and routes them like the tee: render `left` is the wearer\'s right', () => {
    const left = manifest.regions.left
    const right = manifest.regions.right

    if (!left || !right) {
      expect(left ?? right).toBeUndefined()
      return
    }

    // Canonical ids: the wearer's own sides (+x is the wearer's left).
    expect(left.center![0]).toBeGreaterThan(0)
    expect(right.center![0]).toBeLessThan(0)
    // Named as worn, in the house's words, like the tee's tabs.
    expect(left.label).toBe(HOUSE_COPY.wearerLeft)
    expect(right.label).toBe(HOUSE_COPY.wearerRight)
    // Render ids: the camera's, as on every tee version.
    expect(left.renderPanel).toBe(TEE_CREW_SHORT_V3.regions.left!.renderPanel)
    expect(right.renderPanel).toBe(TEE_CREW_SHORT_V3.regions.right!.renderPanel)
  })

  test('the editor lists its panels by render id, in the tee\'s order, each labelled for the wearer', () => {
    const listed = garmentPanels({ garmentId })
    const label = Object.fromEntries(Object.values(manifest.regions).map((region) => [region.renderPanel, region.label]))

    expect(listed.slice(0, 4).map((panel) => panel.id)).toEqual(['front', 'back', 'left', 'right'].filter((id) => id in label))
    for (const panel of listed) {
      expect(panel.label).toBe(label[panel.id])
    }
  })

  test('a mark on the wearer\'s right sleeve shows on the Right sleeve tab, and its preset frames that sleeve', () => {
    if (!('right' in manifest.regions)) {
      return
    }

    const document = createEmptyCanonicalDocument({ templateId: manifest.id })
    document.panels.right!.layers.push({
      id: 'mark',
      kind: 'text',
      content: 'R',
      face: 'sans',
      color: '#111111',
      x: 0.5,
      y: 0.5,
      scale: 0.2,
      rotation: 0,
      opacity: 1,
      visible: true,
    })
    const render = toRenderDocument({ document }).document
    const tab = garmentPanels({ garmentId }).find((panel) => panel.label === HOUSE_COPY.wearerRight)!

    expect(render.layers.find((layer) => layer.id === 'mark')).toMatchObject({ panel: tab.id })
    expect(render.panelUv![tab.id]).toEqual(manifest.regions.right!.uv)
    // The preset with the tab's id aims at the wearer's right, at −x.
    expect(render.modelFrame!.sleeves[tab.id as 'left']).toEqual(manifest.regions.right!.center)
    expect(manifest.regions.right!.center![0]).toBeLessThan(0)
  })

  test('each sleeve view frames the sleeve its preset names', () => {
    const render = toRenderDocument({ document: createEmptyCanonicalDocument({ templateId: manifest.id }) }).document
    const sleeves = render.modelFrame?.sleeves ?? {}

    if ('left' in manifest.regions) {
      // The `left` preset looks at −x, the wearer's right.
      expect(sleeves.left![0]).toBeLessThan(0)
      expect(sleeves.right![0]).toBeGreaterThan(0)
    } else {
      expect(sleeves).toEqual({})
    }
  })

  test('every printing node carries print UVs', async () => {
    const json = glbJson({ bytes: await readBytes({ path: GLB }) })
    const printing = new Set(Object.values(manifest.regions).flatMap((region) => region.mesh.split(' ')))

    for (const node of json.nodes) {
      if (node.mesh === undefined || !printing.has(node.name ?? '')) continue
      for (const primitive of json.meshes[node.mesh]!.primitives) {
        expect(primitive.attributes.TEXCOORD_1, node.name).toBeTypeOf('number')
      }
    }
  })

  test('a new design validates and lists the template panels', () => {
    const document = createEmptyCanonicalDocument({ templateId: manifest.id })

    expect(document.template).toEqual({ id: manifest.id, version: manifest.version })
    expect(Object.keys(document.panels)).toEqual(panels)
    expect(validateCanonicalDocument({ value: document }).ok).toBe(true)
    expect(garmentPanels({ garmentId }).map((panel) => panel.id).sort()).toEqual(
      Object.values(manifest.regions).map((region) => region.renderPanel).sort(),
    )
  })

  test('renders through its own rectangles at its own atlas size', () => {
    const document = createEmptyCanonicalDocument({ templateId: manifest.id })
    // The last panel: a sleeve where there is one, else the back.
    const panel = panels.at(-1)!
    document.panels[panel]!.layers.push({
      id: 'mark',
      kind: 'text',
      content: 'L',
      face: 'sans',
      color: '#111111',
      x: 0.5,
      y: 0.5,
      scale: 0.2,
      rotation: 0,
      opacity: 1,
      visible: true,
    })
    const render = toRenderDocument({ document }).document

    const route = manifest.regions[panel]!.renderPanel

    expect(render.garmentId).toBe(garmentId)
    expect(render.atlasSize).toBe(2048)
    expect(render.modelSrc).toBe(manifest.geometry.file)
    expect(render.panelUv?.[route]).toEqual(manifest.regions[panel]!.uv)
    // Each panel prints in its own rectangle, whatever its render id.
    expect(render.layers.find((layer) => layer.id === 'mark')).toMatchObject({ panel: route })
  })
})

describe('tee-crew-short@4, kept for the designs pinned to it', () => {
  test('still resolves, and its GLB is unchanged', async () => {
    expect(resolveTemplate({ id: 'tee-crew-short', version: 4 })).toEqual({ ok: true, manifest: TEE_CREW_SHORT_V4 })
    const digest = await crypto.subtle.digest('SHA-256', await readBytes({ path: `public${TEE_CREW_SHORT_V4.geometry.file}` }))
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    expect(sha256).toBe(TEE_CREW_SHORT_V4.geometry.sha256)
  })

  test('@5 wraps each sleeve all round where @4 printed it flat from the side', () => {
    for (const panel of ['left', 'right'] as const) {
      expect(TEE_CREW_SHORT_V4.regions[panel]!.notes[0]).toMatch(/^Planar print/)
      expect(TEE_CREW_SHORT_V5.regions[panel]!.notes[0]).toMatch(/^Wrapped all round/)
      // Unrolled, a sleeve is wider than it is long.
      expect(TEE_CREW_SHORT_V5.regions[panel]!.surface!.panelAspect).toBeGreaterThan(1)
    }

    expect(TEE_CREW_SHORT_V5.regions.front!.renderPanel).toBe(TEE_CREW_SHORT_V4.regions.front!.renderPanel)
    expect(TEE_CREW_SHORT_V5.regions.left!.renderPanel).toBe(TEE_CREW_SHORT_V4.regions.left!.renderPanel)
  })
})

describe('tee-crew-short@5, kept for the designs pinned to it', () => {
  test('still resolves, and its GLB is unchanged', async () => {
    expect(resolveTemplate({ id: 'tee-crew-short', version: 5 })).toEqual({ ok: true, manifest: TEE_CREW_SHORT_V5 })
    const digest = await crypto.subtle.digest('SHA-256', await readBytes({ path: `public${TEE_CREW_SHORT_V5.geometry.file}` }))
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    expect(sha256).toBe(TEE_CREW_SHORT_V5.geometry.sha256)
  })
})

/** Per mesh node: how many triangles, and how many print (their print UVs aren't −1). */
async function printedTriangles({ file }: { file: string }) {
  // @ts-expect-error untyped CommonJS module
  const draco3d = (await import('draco3dgltf')) as { default: { createDecoderModule: () => Promise<unknown> } }
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({ 'draco3d.decoder': await draco3d.default.createDecoderModule() })
  const document = await io.readBinary(await readBytes({ path: `public${file}` }))
  const out: Record<string, { triangles: number; printed: number }> = {}

  for (const node of document.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const uv = primitive.getAttribute('TEXCOORD_1')!
      const indices = primitive.getIndices()!.getArray()!
      const entry = (out[node.getName()] ??= { triangles: 0, printed: 0 })

      for (let corner = 0; corner < indices.length; corner += 3) {
        entry.triangles += 1
        if (uv.getElement(indices[corner]!, [0, 0])[0]! >= 0) entry.printed += 1
      }
    }
  }

  return out
}

describe('tee-crew-short@6: the sides print (seam gaps, 17 Nov)', () => {
  test('front and back wrap round the body, so nearly all of the torso prints, where @5 left its sides bare', async () => {
    const v5 = await printedTriangles({ file: TEE_CREW_SHORT_V5.geometry.file })
    const v6 = await printedTriangles({ file: TEE_CREW_SHORT_V6.geometry.file })

    for (const node of ['body-front', 'body-back']) {
      const before = v5[node]!.printed / v5[node]!.triangles
      const after = v6[node]!.printed / v6[node]!.triangles
      // @5 dropped the cloth turned away from a flat view: about a sixth of each side.
      expect(before, node).toBeLessThan(0.9)
      // @6 leaves only a few triangles at the armhole and hem folds.
      expect(after, node).toBeGreaterThan(0.99)
    }

    // The sleeves' inner seam is unrolled too, so they print more than before.
    expect(v6['body-sleeves']!.printed).toBeGreaterThan(v5['body-sleeves']!.printed)
    // The collar is no panel, on either version.
    expect(v6['body-collar']!.printed).toBe(0)
  }, 30_000)

  test('front and back are unrolled to the side seams, and each panel carries its print-space frame', () => {
    for (const panel of ['front', 'back'] as const) {
      expect(TEE_CREW_SHORT_V5.regions[panel]!.notes[0]).toMatch(/^Planar print/)
      expect(TEE_CREW_SHORT_V6.regions[panel]!.notes[0]).toMatch(/^Wrapped round the body/)
      // Unrolled, the body is wider than its flat view.
      expect(TEE_CREW_SHORT_V6.regions[panel]!.surface!.panelAspect).toBeGreaterThan(TEE_CREW_SHORT_V5.regions[panel]!.surface!.panelAspect)
    }

    const perMetre = ({ uv, frame }: { uv: { v0: number; v1: number }; frame?: { y0: number; y1: number } }) => ((uv.v1 - uv.v0) * 2048) / (frame!.y1 - frame!.y0)
    for (const [id, region] of Object.entries(TEE_CREW_SHORT_V6.regions)) {
      const { frame, uv } = region
      expect(frame!.x1, id).toBeGreaterThan(frame!.x0)
      // One shared scale up the garment, so bands keep their width on every panel.
      expect(perMetre(region), id).toBeCloseTo(perMetre(TEE_CREW_SHORT_V6.regions.front!), 0)
      // Each rectangle has its frame's shape, except the back, which spans the front's seam-to-seam width.
      if (id !== 'back') expect((uv.u1 - uv.u0) / (uv.v1 - uv.v0), id).toBeCloseTo((frame!.x1 - frame!.x0) / (frame!.y1 - frame!.y0), 2)
    }

    // Canonical x runs toward the wearer's left on both from the wearer's
    // right seam to the left one, so a pattern phased from the origin meets
    // itself at both side seams.
    const { front, back } = TEE_CREW_SHORT_V6.regions
    expect(front!.frame!.x0).toBeLessThan(0)
    expect(front!.frame!.x1).toBeGreaterThan(0)
    expect([back!.frame!.x0, back!.frame!.x1]).toEqual([front!.frame!.x0, front!.frame!.x1])
    // The back's own arc is within a tenth of the front's.
    const backWidth = ((back!.uv.u1 - back!.uv.u0) * 2048) / perMetre(back!)
    expect(backWidth / (front!.frame!.x1 - front!.frame!.x0)).toBeGreaterThan(0.9)
    // The bake pads panels wider apart, so their edges can bleed (paint-atlas.ts).
    expect(TEE_CREW_SHORT_V6.regions.back!.uv.u0 * 2048).toBeGreaterThanOrEqual(16 - 1e-3)
  })

  test('renders the same panels as @5', () => {
    for (const panel of ['front', 'back', 'left', 'right'] as const) {
      expect(TEE_CREW_SHORT_V6.regions[panel]!.renderPanel).toBe(TEE_CREW_SHORT_V5.regions[panel]!.renderPanel)
      expect(TEE_CREW_SHORT_V6.regions[panel]!.renderMirrorX).toBe(TEE_CREW_SHORT_V5.regions[panel]!.renderMirrorX)
    }
  })
})

/**
 * Roadmap D1: garments baked from their own pattern recipes
 * (scripts/bake-pattern-glb.mjs). Each GLB is pinned here by its sha256, as
 * its manifest pins it; a re-bake that moves one needs a new version.
 */
const BAKED: Array<{ manifest: TemplateManifest; sha256: string }> = [
  { manifest: VEST_V1, sha256: '5e19b674bc72996a2974c4d4daf1f71e0bd5e566406563ea84c0e5f31efb7b4c' },
  { manifest: CROP_V1, sha256: 'f07811266b479674e8352fa56ce1d5766d6a0428dcf46ec27884e8930fde83e2' },
  { manifest: DRESS_V1, sha256: '0851836303bb52fc7cb67dcd5774cd02f515f7543b80c55e565ecc837670347a' },
  { manifest: TROUSERS_V1, sha256: 'ec4c131101aca87f8485baee929a8c4988f0eaca1cb635af49a9af657c5378e1' },
]

describe.each(BAKED)('$manifest.id@$manifest.version (baked from its recipe)', ({ manifest, sha256 }) => {
  test('is pinned, baked by the pattern baker from its own recipe, and named after its garment', () => {
    expect(manifest.geometry.sha256).toBe(sha256)
    expect(manifest.geometry.file).toBe(`/models/${manifest.id}.glb`)
    expect(manifest.geometry.generator).toBe(`scripts/bake-pattern-glb.mjs (${manifest.id}@${manifest.version})`)
    expect(manifest.garmentId).toBe(manifest.id)
  })

  test('is our own model: no third-party credit or licence line', () => {
    expect(garmentCredit({ garmentId: manifest.garmentId })).toBeUndefined()
  })

  test('stays within the per-template GLB budget', async () => {
    const bytes = await readBytes({ path: `public${manifest.geometry.file}` })
    // scripts/budgets.json glbPerTemplateKiB
    expect(bytes.byteLength / 1024).toBeLessThanOrEqual(1228.8)
  })
})
