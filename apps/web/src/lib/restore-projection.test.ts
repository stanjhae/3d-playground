import { type Mesh, MeshStandardMaterial, Texture } from 'three'
import { beforeEach, describe, expect, test } from 'vitest'

import { bindInkMap } from './apply-ink'
import { listMeshes } from './apply-overrides'
import { type CanonicalDocument, createEmptyCanonicalDocument } from './canonical-document'
import { loadCloudDesign } from './cloud-design-load'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import type { DesignWithHead } from './flp-api/client'
import { type AtlasBuffer, rasterizeLayers } from './paint-atlas'
import { atlasPixelForUv, panelPointToUv } from './panel-uv'
import { createClothingMesh } from './tee-geometry'

/**
 * R02 #165 restore fixtures. A restore appends a verbatim copy of an
 * earlier version (flp_restore_version), which the studio then reopens
 * through `loadCloudDesign`. Each fixture restores a historical version
 * pinned to @1 or @2 and checks, at the projection, atlas and mesh, that
 * the back renders in the orientation its template stores and that the
 * collar stays unprinted however much of the front's top is inked.
 */

const RED = '#c81e1e'
const BLUE = '#1e3cc8'

/** A version as it was saved: ink across the neckline, an off-centre back. */
function historicalVersion({ version }: { version: 1 | 2 }): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.template = { id: 'tee-crew-short', version }
  document.panels.front.layers.push(
    {
      id: 'front-ink',
      kind: 'paint',
      visible: true,
      opacity: 1,
      strokes: [
        {
          id: 'neckline',
          tool: 'brush',
          color: RED,
          width: 0.04,
          opacity: 1,
          // Inside the collar band's UV overlap (front y above ≈ 0.861).
          points: [0.05, 0.95, 0.35, 0.95, 0.65, 0.95, 0.95, 0.95],
        },
      ],
    },
    {
      id: 'front-word',
      kind: 'text',
      visible: true,
      opacity: 1,
      x: 0.5,
      y: 0.93,
      scale: 0.12,
      rotation: 0,
      content: 'TOP',
      face: 'sans',
      color: RED,
    },
  )
  document.panels.back.layers.push(
    {
      id: 'back-ink',
      kind: 'paint',
      visible: true,
      opacity: 1,
      strokes: [
        {
          id: 'one-side',
          tool: 'brush',
          color: BLUE,
          width: 0.03,
          opacity: 1,
          // Only on the canonical x > 0.5 half.
          points: [0.7, 0.2, 0.8, 0.2, 0.9, 0.2],
        },
      ],
    },
    {
      id: 'back-word',
      kind: 'text',
      visible: true,
      opacity: 1,
      x: 0.8,
      y: 0.7,
      scale: 0.1,
      rotation: 0.3,
      content: 'BACK',
      face: 'display',
      color: BLUE,
    },
  )
  return document
}

/** A design whose history holds both templates; restoring copies one to a new head. */
function historyServer({ versions }: { versions: CanonicalDocument[] }) {
  // Stored content is JSON; restore copies it byte for byte.
  const stored = versions.map((document) => JSON.stringify(document))
  let head = stored.length

  return {
    restore({ fromSeq }: { fromSeq: number }) {
      stored.push(stored[fromSeq - 1]!)
      head = stored.length
    },
    get: async (): Promise<{ ok: true; data: DesignWithHead }> => ({
      ok: true,
      data: {
        id: 'design-history',
        title: 'History',
        description: '',
        visibility: 'private',
        headSeq: head,
        updatedAt: '2026-11-01T00:00:00Z',
        head: {
          seq: head,
          kind: 'restore',
          content: JSON.parse(stored[head - 1]!),
          contentHash: `h${head}`,
          createdAt: '2026-11-01T00:00:00Z',
        },
      },
    }),
  }
}

async function restore({ version }: { version: 1 | 2 }) {
  // Seq 1 is @1, seq 2 the same design after the @2 upgrade; head is seq 2.
  const server = historyServer({ versions: [historicalVersion({ version: 1 }), historicalVersion({ version: 2 })] })
  server.restore({ fromSeq: version })
  expect(await loadCloudDesign({ designId: 'design-history', get: server.get })).toEqual({ ok: true })
  return useEditorStore.getState().document
}

function inkAt({ atlas, panel, x, y }: { atlas: AtlasBuffer; panel: 'front' | 'back'; x: number; y: number }) {
  const { u, v } = panelPointToUv({ panel, x, y })
  const { index } = atlasPixelForUv({ u, v, width: atlas.width, height: atlas.height })
  return { b: atlas.pixels[index + 2]!, a: atlas.pixels[index + 3]! }
}

/** UVs across every triangle of a mesh (a barycentric grid). */
function surfaceUvs({ mesh }: { mesh: Mesh }) {
  const uv = mesh.geometry.attributes.uv!
  const index = mesh.geometry.index
  const corners = index ? Array.from(index.array) : Array.from({ length: uv.count }, (_, i) => i)
  const samples: { u: number; v: number }[] = []
  const steps = 4

  for (let triangle = 0; triangle + 2 < corners.length; triangle += 3) {
    const [a, b, c] = [corners[triangle]!, corners[triangle + 1]!, corners[triangle + 2]!]

    for (let i = 0; i <= steps; i += 1) {
      for (let j = 0; j <= steps - i; j += 1) {
        const wa = i / steps
        const wb = j / steps
        const wc = 1 - wa - wb
        samples.push({
          u: uv.getX(a) * wa + uv.getX(b) * wb + uv.getX(c) * wc,
          v: uv.getY(a) * wa + uv.getY(b) * wb + uv.getY(c) * wc,
        })
      }
    }
  }

  return samples
}

function inkedUnder({ mesh, atlas }: { mesh: Mesh; atlas: AtlasBuffer }) {
  return surfaceUvs({ mesh }).filter(({ u, v }) => {
    const { index } = atlasPixelForUv({ u, v, width: atlas.width, height: atlas.height })
    return (atlas.pixels[index + 3] ?? 0) > 0
  }).length
}

describe.each([
  // @1 back renders as stored (canonical x); @2 mirrors it to read from behind.
  { version: 1 as const, backX: 0.8, backRotation: 0.3, inkedHalf: 0.8, cleanHalf: 0.2 },
  { version: 2 as const, backX: 0.2, backRotation: -0.3, inkedHalf: 0.2, cleanHalf: 0.8 },
])('restoring a version pinned to @$version (#165)', ({ version, backX, backRotation, inkedHalf, cleanHalf }) => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  test('reopens exactly as stored, keeping its template', async () => {
    await restore({ version })

    expect(getCanonicalDocument()).toEqual(historicalVersion({ version }))
    expect(useEditorStore.getState()).toMatchObject({ undoCount: 0, limitNotice: null })
  })

  test('the back projects in the orientation its template stores', async () => {
    const document = await restore({ version })
    const word = document.layers.find((layer) => layer.id === 'back-word')
    const ink = document.layers.find((layer) => layer.id === 'back-ink')

    expect(word).toMatchObject({ panel: 'back', x: expect.closeTo(backX, 9), y: 0.7, rotation: backRotation })
    expect(ink?.kind === 'paint' && ink.strokes[0]!.points.map((point) => point.x)).toEqual(
      [0.7, 0.8, 0.9].map((x) => expect.closeTo(version === 1 ? x : 1 - x, 9)),
    )
  })

  test('back ink lands on the stored half of the back atlas, not the other', async () => {
    const atlas = rasterizeLayers({ document: await restore({ version }) })

    expect(inkAt({ atlas, panel: 'back', x: inkedHalf, y: 0.2 })).toMatchObject({ a: 255, b: 0xc8 })
    expect(inkAt({ atlas, panel: 'back', x: cleanHalf, y: 0.2 }).a).toBe(0)
  })

  test('the front neckline mark shows on the body and never on the collar', async () => {
    const atlas = rasterizeLayers({ document: await restore({ version }) })
    const meshes = listMeshes({ root: createClothingMesh() })
    bindInkMap({ meshes, inkMap: new Texture() })
    const collar = meshes.find((mesh) => mesh.name === 'body-collar')!
    const body = meshes.find((mesh) => mesh.name === 'body')!

    // The collar's UVs really do sit under the front mark…
    expect(inkedUnder({ mesh: collar, atlas })).toBeGreaterThan(0)
    // …but it takes no ink map, so the mark shows on the body alone.
    expect((collar.material as MeshStandardMaterial).userData.inkMap).toBeNull()
    expect((body.material as MeshStandardMaterial).userData.inkMap).toBeInstanceOf(Texture)
    expect(inkedUnder({ mesh: body, atlas })).toBeGreaterThan(0)
  })
})

describe('restoring across templates (#165)', () => {
  test('restoring @1 over an @2 head, then @2 again, flips only the back', async () => {
    useEditorStore.getState().reset()
    const older = await restore({ version: 1 })
    const newer = await restore({ version: 2 })
    const byId = (layers: typeof older.layers) => Object.fromEntries(layers.map((layer) => [layer.id, layer]))

    expect(byId(older.layers)['front-word']).toEqual(byId(newer.layers)['front-word'])
    expect(byId(older.layers)['front-ink']).toEqual(byId(newer.layers)['front-ink'])
    expect(byId(older.layers)['back-word']).not.toEqual(byId(newer.layers)['back-word'])
  })
})
