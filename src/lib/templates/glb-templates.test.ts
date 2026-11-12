import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument, validateCanonicalDocument } from '../canonical-document'
import { isCanonicalGarment } from '../concept-flags'
import { garmentPanels } from '../garments'
import { HOUSE_COPY } from '../house-copy'
import { toRenderDocument } from '../render-projection'
import { resolveTemplate, TEE_CREW_SHORT_V3, templateForGarment, type TemplateManifest } from '../template-manifest'
import { HOODIE_V1 } from './hoodie'
import { TEE_CREW_SHORT_V4 } from './tee-v4'
import { COAT_V1 } from './coat'
import { GOWN_V1 } from './gown'
import { MIXED_V1 } from './mixed'
import { OVERALL_V1 } from './overall'
import { SLIP_V1 } from './slip'
import { SUIT_V1 } from './suit'
import { TAILORED_V1 } from './tailored'

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
  { manifest: TEE_CREW_SHORT_V4, panels: ['front', 'back', 'left', 'right'] },
  { manifest: MIXED_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: COAT_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: SUIT_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: TAILORED_V1, panels: ['front', 'back', 'left', 'right'] },
  { manifest: SLIP_V1, panels: ['front', 'back'] },
  { manifest: OVERALL_V1, panels: ['front', 'back'] },
  { manifest: GOWN_V1, panels: ['front', 'back'] },
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
