import { type BufferGeometry, Mesh, type Object3D, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'

import { type CanonicalDocument, createEmptyCanonicalDocument } from './canonical-document'
import { applyCanonicalCommand } from './canonical-commands'
import { createTeeEngine, teeRenderDocument, translateCommand } from './editor-canonical'
import { garmentPanels } from './garments'
import { rasterizeLayers } from './paint-atlas'
import { DEFAULT_PANEL_UV, panelPointToUv } from './panel-uv'
import { toRenderDocument } from './render-projection'
import { createTeeMesh } from './tee-geometry'
import { CURRENT_TEMPLATE, TEE_CREW_SHORT_V1 } from './template-manifest'

/**
 * R02 #165: print orientation pinned through the real geometry. A panel
 * reads correctly when, seen from outside the garment, atlas +u and +v
 * point screen-right and screen-up: (∂P/∂u × ∂P/∂v) faces outward.
 */

const tee = createTeeMesh(CURRENT_TEMPLATE.geometry.structural)

function meshNamed({ name }: { name: string }) {
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

type Face = { centroid: Vector3; facing: Vector3; u: number; v: number }

/** Each triangle's centroid, UV centroid and (∂P/∂u × ∂P/∂v). */
function faces({ geometry }: { geometry: BufferGeometry }): Face[] {
  const position = geometry.attributes.position!
  const uv = geometry.attributes.uv!
  const index = geometry.index!
  const result: Face[] = []

  for (let face = 0; face < index.count; face += 3) {
    const [a, b, c] = [0, 1, 2].map((corner) => index.getX(face + corner)) as [number, number, number]
    const p = [a, b, c].map((i) => new Vector3(position.getX(i), position.getY(i), position.getZ(i)))
    const t = [a, b, c].map((i) => ({ u: uv.getX(i), v: uv.getY(i) }))
    const e1 = p[1]!.clone().sub(p[0]!)
    const e2 = p[2]!.clone().sub(p[0]!)
    const du1 = t[1]!.u - t[0]!.u
    const dv1 = t[1]!.v - t[0]!.v
    const du2 = t[2]!.u - t[0]!.u
    const dv2 = t[2]!.v - t[0]!.v
    const det = du1 * dv2 - du2 * dv1

    if (Math.abs(det) < 1e-12) {
      continue
    }

    const dPdu = e1.clone().multiplyScalar(dv2).sub(e2.clone().multiplyScalar(dv1)).divideScalar(det)
    const dPdv = e2.clone().multiplyScalar(du1).sub(e1.clone().multiplyScalar(du2)).divideScalar(det)

    result.push({
      centroid: p[0]!.clone().add(p[1]!).add(p[2]!).divideScalar(3),
      facing: dPdu.cross(dPdv),
      u: (t[0]!.u + t[1]!.u + t[2]!.u) / 3,
      v: (t[0]!.v + t[1]!.v + t[2]!.v) / 3,
    })
  }

  return result
}

/** Outward direction from an open tube's axis (top ring → bottom ring). */
function outwardFromAxis({ geometry }: { geometry: BufferGeometry }) {
  const position = geometry.attributes.position!
  const uv = geometry.attributes.uv!
  let vMin = Infinity
  let vMax = -Infinity

  for (let i = 0; i < uv.count; i += 1) {
    vMin = Math.min(vMin, uv.getY(i))
    vMax = Math.max(vMax, uv.getY(i))
  }

  const ring = (target: number) => {
    const sum = new Vector3()
    let count = 0

    for (let i = 0; i < uv.count; i += 1) {
      if (Math.abs(uv.getY(i) - target) < 1e-6) {
        sum.add(new Vector3(position.getX(i), position.getY(i), position.getZ(i)))
        count += 1
      }
    }

    return sum.divideScalar(count)
  }

  const top = ring(vMax)
  const axis = ring(vMin).sub(top).normalize()

  return (point: Vector3) => {
    const along = point.clone().sub(top)
    return along.sub(axis.clone().multiplyScalar(along.dot(axis)))
  }
}

/** World position where a render-panel point lands on the garment. */
function landing({ mesh, u, v }: { mesh: string; u: number; v: number }) {
  let best: Face | undefined
  let distance = Infinity

  for (const face of faces({ geometry: meshNamed({ name: mesh }) })) {
    const d = Math.hypot(face.u - u, face.v - v)

    if (d < distance) {
      distance = d
      best = face
    }
  }

  return best!.centroid
}

function bodyPoint({ panel, x, y }: { panel: 'front' | 'back'; x: number; y: number }) {
  const { u, v } = panelPointToUv({ panel, x, y })
  return landing({ mesh: 'body', u, v })
}

describe('every print panel reads correctly from outside (@2 geometry)', () => {
  test('front and back: atlas axes face out of the body', () => {
    const body = faces({ geometry: meshNamed({ name: 'body' }) })
    const front = body.filter((face) => face.u < 0.5 && face.v > CURRENT_TEMPLATE.regions.front.uv.v0)
    const back = body.filter((face) => face.u > 0.5)

    expect(front.length).toBeGreaterThan(50)
    expect(back.length).toBeGreaterThan(50)

    for (const face of [...front, ...back]) {
      const outward = new Vector3(face.centroid.x, 0, face.centroid.z)
      expect(face.facing.dot(outward)).toBeGreaterThan(0)
    }
  })

  test('both sleeves: atlas axes face out of the sleeve', () => {
    for (const panel of ['left', 'right'] as const) {
      const geometry = meshNamed({ name: CURRENT_TEMPLATE.regions[panel].mesh })
      const outward = outwardFromAxis({ geometry })
      const sleeve = faces({ geometry })

      expect(sleeve.length).toBeGreaterThan(50)

      for (const face of sleeve) {
        expect(face.facing.dot(outward(face.centroid))).toBeGreaterThan(0)
      }
    }
  })

  test('back canvas left-to-right runs screen-left to screen-right from behind', () => {
    // Seen from behind (camera on −z), screen-right is world −x.
    const start = bodyPoint({ panel: 'back', x: 0.25, y: 0.69 })
    const end = bodyPoint({ panel: 'back', x: 0.75, y: 0.69 })

    expect(-end.x).toBeGreaterThan(-start.x)
    expect(start.z).toBeLessThan(0)
    expect(end.z).toBeLessThan(0)
  })

  test('front canvas left-to-right runs screen-left to screen-right from the front', () => {
    const start = bodyPoint({ panel: 'front', x: 0.25, y: 0.69 })
    const end = bodyPoint({ panel: 'front', x: 0.75, y: 0.69 })

    expect(end.x).toBeGreaterThan(start.x)
    expect(start.z).toBeGreaterThan(0)
  })
})

/** An asymmetric mark: text at the wearer's-left shoulder blade, tilted. */
function backTextDocument({ version }: { version: number }): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.template = { id: 'tee-crew-short', version }
  document.panels.back.layers.push({
    id: 'back-text',
    kind: 'text',
    visible: true,
    opacity: 1,
    x: 0.8,
    y: 0.7,
    scale: 0.1,
    rotation: 0.3,
    content: 'FLP',
    face: 'sans',
    color: '#111111',
  })
  document.panels.back.layers.push({
    id: 'back-paint',
    kind: 'paint',
    visible: true,
    opacity: 1,
    strokes: [
      { id: 'tick', tool: 'brush', color: '#111111', width: 0.02, opacity: 1, points: [0.6, 0.2, 0.9, 0.2, 0.9, 0.4] },
    ],
  })
  return document
}

function projected({ document }: { document: CanonicalDocument }) {
  const layers = toRenderDocument({ document }).document.layers
  const text = layers.find((layer) => layer.id === 'back-text')
  const paint = layers.find((layer) => layer.id === 'back-paint')

  if (text?.kind !== 'text' || paint?.kind !== 'paint') {
    throw new Error('missing projected layers')
  }

  return { text, stroke: paint.strokes[0]! }
}

describe('back panel projection by template version', () => {
  test('@2: canonical x toward the wearer’s left lands on the wearer’s left, readable from behind', () => {
    const { text, stroke } = projected({ document: backTextDocument({ version: 2 }) })

    expect(text).toMatchObject({ panel: 'back', x: expect.closeTo(0.2, 9), y: 0.7, rotation: -0.3 })
    expect(stroke.points).toEqual([
      { x: expect.closeTo(0.4, 9), y: 0.2 },
      { x: expect.closeTo(0.1, 9), y: 0.2 },
      { x: expect.closeTo(0.1, 9), y: 0.4 },
    ])
    expect(bodyPoint({ panel: 'back', x: text.x, y: text.y }).x).toBeGreaterThan(0)
  })

  test('@1: stored content renders as drawn on the 2D canvas, unchanged', () => {
    const document = backTextDocument({ version: 1 })
    const before = JSON.stringify(document)
    const { text, stroke } = projected({ document })

    expect(text).toMatchObject({ panel: 'back', x: 0.8, y: 0.7, rotation: 0.3 })
    expect(stroke.points[0]).toEqual({ x: 0.6, y: 0.2 })
    expect(JSON.stringify(document)).toBe(before)
    expect(TEE_CREW_SHORT_V1.regions.back.renderMirrorX).toBe(false)
  })

  test('front and sleeves are never mirrored', () => {
    for (const version of [1, 2]) {
      const document = createEmptyCanonicalDocument()
      document.template = { id: 'tee-crew-short', version }

      for (const panel of ['front', 'left', 'right'] as const) {
        document.panels[panel].layers.push({
          id: `t-${panel}`,
          kind: 'text',
          visible: true,
          opacity: 1,
          x: 0.8,
          y: 0.5,
          scale: 0.1,
          rotation: 0.3,
          content: 'FLP',
          face: 'sans',
          color: '#111111',
        })
      }

      for (const layer of toRenderDocument({ document }).document.layers) {
        expect(layer).toMatchObject({ x: 0.8, rotation: 0.3 })
      }
    }
  })
})

describe('editor input on the mirrored back', () => {
  test('render-space input round-trips through canonical (@2)', () => {
    let engine = createTeeEngine()
    expect(engine.stack.document.template.version).toBe(2)

    const run = (command: Parameters<typeof translateCommand>[0]['command']) => {
      const translated = translateCommand({ engine, command })

      if (!translated) {
        throw new Error('not translated')
      }

      const result = applyCanonicalCommand({ stack: engine.stack, command: translated.command })

      if (!result.ok) {
        throw new Error('rejected')
      }

      engine = { stack: result.stack, assetSources: translated.assetSources }
    }

    run({
      type: 'addText',
      layer: {
        id: 'typed',
        kind: 'text',
        panel: 'back',
        content: 'FLP',
        face: 'sans',
        color: '#111111',
        x: 0.2,
        y: 0.6,
        scale: 0.1,
        rotation: 0.3,
        opacity: 1,
        visible: true,
      },
    })
    run({
      type: 'addStroke',
      stroke: { id: 's1', panel: 'back', color: '#111111', width: 0.02, tool: 'brush', points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }] },
    })

    const stored = engine.stack.document.panels.back.layers
    expect(stored[0]).toMatchObject({ x: 0.8, rotation: -0.3 })
    expect(stored[1]).toMatchObject({ kind: 'paint' })

    const rendered = teeRenderDocument({ engine })
    expect(rendered.layers.find((layer) => layer.id === 'typed')).toMatchObject({
      x: expect.closeTo(0.2, 9),
      rotation: 0.3,
    })

    run({ type: 'updateLayer', layerId: 'typed', patch: { x: 0.35, rotation: -1 } })
    expect(engine.stack.document.panels.back.layers[0]).toMatchObject({ x: 0.65, rotation: 1 })

    const strokes = rendered.layers.flatMap((layer) => (layer.kind === 'paint' ? layer.strokes : []))
    expect(strokes[0]?.points.map((point) => Number(point.x.toFixed(6)))).toEqual([0.1, 0.3])
  })
})

describe('sleeves are independent and named by wearer side (E02 #153)', () => {
  test('a mark on one sleeve inks only that sleeve’s atlas rectangle', () => {
    for (const panel of ['left', 'right'] as const) {
      const document = createEmptyCanonicalDocument()
      document.panels[panel].layers.push({
        id: 'sleeve-paint',
        kind: 'paint',
        visible: true,
        opacity: 1,
        strokes: [
          {
            id: 'band',
            tool: 'brush',
            color: '#111111',
            width: 0.05,
            opacity: 1,
            points: [0, 0.5, 0.5, 0.5, 1, 0.5, 1, 1, 0, 0],
          },
        ],
      })

      const size = 128
      const buffer = rasterizeLayers({ document: toRenderDocument({ document }).document, width: size, height: size })
      const own = DEFAULT_PANEL_UV[CURRENT_TEMPLATE.regions[panel].renderPanel]
      let inside = 0
      let outside = 0

      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          if (buffer.pixels[(row * size + column) * 4 + 3]! === 0) {
            continue
          }

          const u = (column + 0.5) / size
          const v = 1 - (row + 0.5) / size
          const mine = u >= own.u0 && u <= own.u1 && v >= own.v0 && v <= own.v1

          if (mine) {
            inside += 1
          } else {
            outside += 1
          }
        }
      }

      expect(inside).toBeGreaterThan(0)
      expect(outside).toBe(0)
    }
  })

  test('the studio labels each sleeve tab by the wearer’s side its mesh is on', () => {
    const labels = Object.fromEntries(garmentPanels({ garmentId: 'tee' }).map((panel) => [panel.id, panel.label]))

    for (const panel of ['left', 'right'] as const) {
      const region = CURRENT_TEMPLATE.regions[panel]
      const sleeve = new Vector3()
      meshNamed({ name: region.mesh }).computeBoundingBox()
      meshNamed({ name: region.mesh }).boundingBox!.getCenter(sleeve)

      // +x is the wearer's left (the front faces +z).
      expect(labels[region.renderPanel]).toBe(sleeve.x > 0 ? "Wearer's left" : "Wearer's right")
    }
  })
})
