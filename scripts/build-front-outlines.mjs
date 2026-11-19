// The front panel's outline for every model-based template, for the flat
// still on a My Studio card (`design-thumbnail.ts`). The studio traces each
// side's shape from the loaded model (`shapesFromScene`); a card can't load
// a model per design, so the front's clean outline is traced here once, the
// same way, and kept in `src/lib/front-outlines.gen.ts`.
//
//   node scripts/build-front-outlines.mjs
//
// Run it again whenever a template's GLB changes: a test checks that every
// outline names its model's current SHA-256 (its first 16 characters).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

import { panelOutlinePolygons, panelTriangles } from '../src/lib/panel-shape.ts'
import { TEMPLATE_IDS, resolveTemplate } from '../src/lib/template-manifest.ts'

const OUT = 'src/lib/front-outlines.gen.ts'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

/** Every model-based manifest this build can open, oldest version first; the tee's card draws a tee outline, so not the tee. */
function glbManifests() {
  const manifests = []

  for (const id of TEMPLATE_IDS) {
    for (let version = 1; version <= 50; version += 1) {
      const resolved = resolveTemplate({ id, version })

      if (resolved.ok && resolved.manifest.geometry.kind === 'glb' && resolved.manifest.garmentId !== 'tee' && resolved.manifest.regions.front) {
        manifests.push(resolved.manifest)
      }
    }
  }

  return manifests
}

/**
 * Douglas-Peucker on a closed outline ([x0, y0, x1, y1, …]): drops points
 * closer than `tolerance` (in panel units) to the line through their
 * neighbours. Half a percent of the panel is invisible on a card.
 */
function simplifyClosed(flat, tolerance) {
  const points = []
  for (let at = 0; at < flat.length; at += 2) points.push([flat[at], flat[at + 1]])
  if (points.length < 4) return flat

  const distance = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax
    const dy = by - ay
    const length = Math.hypot(dx, dy)
    return length === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length
  }
  const simplify = (run) => {
    if (run.length < 3) return run
    let far = 0
    let index = 0
    for (let at = 1; at < run.length - 1; at += 1) {
      const d = distance(run[at], run[0], run[run.length - 1])
      if (d > far) [far, index] = [d, at]
    }
    if (far <= tolerance) return [run[0], run[run.length - 1]]
    return [...simplify(run.slice(0, index + 1)).slice(0, -1), ...simplify(run.slice(index))]
  }
  // Split the ring at its two most distant points, so both halves keep their shape.
  let [first, second, best] = [0, 0, -1]
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const d = Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1])
      if (d > best) [first, second, best] = [a, b, d]
    }
  }
  const ring = [...points.slice(first), ...points.slice(0, first)]
  const split = (second - first + points.length) % points.length
  const one = simplify(ring.slice(0, split + 1))
  const two = simplify([...ring.slice(split), ring[0]])
  return [...one.slice(0, -1), ...two.slice(0, -1)].flat()
}

async function frontOutline({ manifest }) {
  const path = `public${manifest.geometry.file}`
  const bytes = readFileSync(path)
  const document = await io.readBinary(new Uint8Array(bytes))
  const rect = manifest.regions.front.uv
  const triangles = []

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const uvs = primitive.getAttribute('TEXCOORD_1')

      if (!uvs) {
        continue
      }

      const index = primitive.getIndices()
      for (const value of panelTriangles({ uvs: uvs.getArray(), index: index ? index.getArray() : null, rect })) {
        triangles.push(value)
      }
    }
  }

  const polygons = panelOutlinePolygons({ triangles, symmetric: true })
  return {
    // Enough of the model's SHA-256 to tell a re-baked model.
    sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
    // Two decimals (1% of the panel) are plenty for a card thumbnail, and keep
    // the bundle inside its byte budget; points that round onto the one
    // before are dropped.
    polygons: polygons.map((polygon) => {
      const rounded = simplifyClosed(polygon, 0.005).map((value) => Math.round(value * 100) / 100)
      const kept = []
      for (let at = 0; at < rounded.length; at += 2) {
        const [x, y] = [rounded[at], rounded[at + 1]]
        if (kept.length >= 2 && kept[kept.length - 2] === x && kept[kept.length - 1] === y) {
          continue
        }
        kept.push(x, y)
      }
      return kept
    }),
  }
}

const entries = []

for (const manifest of glbManifests()) {
  const outline = await frontOutline({ manifest })
  entries.push([`${manifest.id}@${manifest.version}`, outline])
  console.log(`${manifest.id}@${manifest.version}: ${outline.polygons.map((polygon) => polygon.length / 2).join(' + ')} points`)
}

const body = entries
  .map(([key, { sha256, polygons }]) => `  '${key}': {\n    sha256: '${sha256}',\n    polygons: [${polygons.map((polygon) => `[${polygon.join(', ')}]`).join(', ')}],\n  },`)
  .join('\n')

writeFileSync(
  OUT,
  `// Generated by scripts/build-front-outlines.mjs from each template's GLB. Do not edit by hand.

/**
 * Each model-based template's front panel outline, by \`id@version\`: one or
 * more polygons, flat [x0, y0, x1, y1, …] in panel space (x across, y up),
 * and the start of the SHA-256 of the GLB it was traced from.
 */
export const FRONT_OUTLINES: Readonly<Record<string, { sha256: string; polygons: readonly (readonly number[])[] }>> = {
${body}
}
`,
)
console.log(`wrote ${OUT}`)
