import { type Mesh, MeshStandardMaterial, Texture } from 'three'
import { describe, expect, test } from 'vitest'

import { bindInkMap } from './apply-ink'
import { listMeshes } from './apply-overrides'
import { createEmptyCanonicalDocument } from './canonical-document'
import { type AtlasBuffer, rasterizeLayers } from './paint-atlas'
import { atlasPixelForUv } from './panel-uv'
import { toRenderDocument } from './render-projection'
import { createClothingMesh } from './tee-geometry'

/**
 * R02 #165 fixture: the collar band's UVs overlap the front print above
 * y ≈ 0.861. A mark drawn at the top of the front must show on the body
 * there and never on the collar; the front, back and sleeve UVs (and so
 * every existing print) stay exactly where they were.
 */

const TOP_OF_FRONT = (() => {
  const document = createEmptyCanonicalDocument()
  document.panels.front.layers.push({
    id: 'paint-front',
    kind: 'paint',
    visible: true,
    opacity: 1,
    strokes: [
      {
        id: 'ink-top',
        tool: 'brush',
        color: '#c81e1e',
        width: 0.03,
        opacity: 1,
        // Across the whole neckline, inside the collar's overlap.
        points: [0.05, 0.95, 0.35, 0.95, 0.65, 0.95, 0.95, 0.95],
      },
    ],
  })
  return document
})()

/** UVs across every triangle of a mesh (a barycentric grid), not just vertices. */
function surfaceUvs({ mesh }: { mesh: Mesh }) {
  const uv = mesh.geometry.attributes.uv!
  const index = mesh.geometry.index
  const corners = index ? Array.from(index.array) : Array.from({ length: uv.count }, (_, i) => i)
  const samples: { u: number; v: number }[] = []
  const steps = 6

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

function inkUnder({ atlas, u, v }: { atlas: AtlasBuffer; u: number; v: number }) {
  const { index } = atlasPixelForUv({ u, v, width: atlas.width, height: atlas.height })
  return atlas.pixels[index + 3] ?? 0
}

/** How many surface samples show ink: only meshes bound to the ink map can. */
function inkedSamples({ mesh, atlas }: { mesh: Mesh; atlas: AtlasBuffer }) {
  if (!(mesh.material as MeshStandardMaterial).userData.inkMap) {
    return 0
  }

  return surfaceUvs({ mesh }).filter(({ u, v }) => inkUnder({ atlas, u, v }) > 0).length
}

describe('collar band and the front print (#165)', () => {
  const atlas = rasterizeLayers({ document: toRenderDocument({ document: TOP_OF_FRONT }).document })
  const meshes = listMeshes({ root: createClothingMesh() })
  bindInkMap({ meshes, inkMap: new Texture() })
  const collar = meshes.find((mesh) => mesh.name === 'body-collar')!
  const body = meshes.find((mesh) => mesh.name === 'body')!

  test('the collar UVs still overlap the mark (the overlap is real)', () => {
    const underMark = surfaceUvs({ mesh: collar }).filter(({ u, v }) => inkUnder({ atlas, u, v }) > 0)

    expect(underMark.length).toBeGreaterThan(0)
  })

  test('a mark at the top of the front shows on the body, not on the collar', () => {
    expect(inkedSamples({ mesh: body, atlas })).toBeGreaterThan(0)
    expect(inkedSamples({ mesh: collar, atlas })).toBe(0)
    expect((collar.material as MeshStandardMaterial).userData.inkMap).toBeNull()
  })

  test('every other mesh keeps the print', () => {
    for (const mesh of meshes.filter((entry) => entry !== collar)) {
      expect((mesh.material as MeshStandardMaterial).userData.inkMap).toBeInstanceOf(Texture)
    }
  })

  test('clearing the ink leaves the collar unprinted too', () => {
    bindInkMap({ meshes, inkMap: null })
    expect((collar.material as MeshStandardMaterial).userData.inkMap).toBeNull()
    bindInkMap({ meshes, inkMap: new Texture() })
    expect((collar.material as MeshStandardMaterial).userData.inkMap).toBeNull()
  })
})
