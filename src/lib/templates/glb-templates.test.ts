import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument, validateCanonicalDocument } from '../canonical-document'
import { isCanonicalGarment } from '../concept-flags'
import { garmentPanels } from '../garments'
import { toRenderDocument } from '../render-projection'
import { resolveTemplate, templateForGarment, type TemplateManifest } from '../template-manifest'
import { HOODIE_V1 } from './hoodie'
import { TEE_CREW_SHORT_V4 } from './tee-v4'

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
    document.panels.left!.layers.push({
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

    const route = manifest.regions.left!.renderPanel

    expect(render.garmentId).toBe(garmentId)
    expect(render.atlasSize).toBe(2048)
    expect(render.modelSrc).toBe(manifest.geometry.file)
    expect(render.panelUv?.[route]).toEqual(manifest.regions.left!.uv)
    // The wearer's left sleeve prints in its own rectangle, whatever its render id.
    expect(render.layers.find((layer) => layer.id === 'mark')).toMatchObject({ panel: route })
  })
})
