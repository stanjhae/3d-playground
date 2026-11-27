// Bake a garment template's GLB from its pattern recipe (roadmap D0).
//
// A pattern recipe (`src/lib/pattern/templates.ts`) is draped on the
// neutral body by the same pure-TS cloth solver the studio runs in its
// worker (`drape-job.ts`), built into a scene by `pattern-scene.ts` (fabric
// UVs in `uv`, print UVs in `uv1` from each panel's frame), exported as a
// GLB with three's GLTFExporter (`uv1` becomes TEXCOORD_1), and then goes
// through the same slim steps as a real model:
//
//   1. scripts/simplify-parts.mjs   weld (and, with --body-ratio, simplify)
//   2. scripts/compress-models.sh   Draco, as every shipped model
//   3. scripts/build-template.mjs   "printUv": "keep": checks the print UVs,
//                                   writes the manifest (regions from the
//                                   frames, sha256, bounds, panel centres)
//
// The atlas packs the panel frames (millimetres) at one shared scale, so a
// mark of the same size reads the same size on every panel. The drape stays
// in the mannequin's frame (floor at y = 0), not seated on an older model.
//
// The output is deterministic: the same recipe, solver and tools give the
// same bytes, so a re-run leaves the sha256 as it was.
//
//   pnpm bake:pattern --template tee-crew-short --version 5
//   pnpm bake:pattern --template tee-crew-short --version 5 \
//     --glb public/models/<id>.glb --manifest src/lib/templates/<id>.ts
//
// By default it writes to .bake/<id>@<version>/ (git-ignored, never shipped).
// See docs/template-manifest.md, "Baked from a pattern".
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

import { runDrapeJob } from '../src/lib/cloth/drape-job.ts'
import { buildPatternScene } from '../src/lib/pattern/pattern-scene.ts'
import { patternTemplateFor } from '../src/lib/pattern/templates.ts'
import { resolveTemplate } from '../src/lib/template-manifest.ts'
import { atlasRects, packPanels } from './atlas-pack.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Canonical sleeves name the wearer's side, render panels the camera's (as `build-template.mjs`). */
const RENDER_SIDE = { left: 'right', right: 'left' }

// GLTFExporter reads its binary through FileReader, which node lacks.
class NodeFileReader {
  result = null
  onloadend = null

  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    })
  }

  readAsDataURL(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
      this.onloadend?.()
    })
  }
}

globalThis.FileReader ??= NodeFileReader

/** Drape a recipe on the neutral body, synchronously, as the cloth worker does. */
export function drapeRecipe({ pattern, spacing }) {
  let outcome = null
  runDrapeJob({ type: 'drape', job: 0, pattern, spacing }, (message) => {
    if (message.type !== 'progress') outcome = message
  })
  if (outcome?.type !== 'done') throw new Error(`The drape failed: ${outcome?.message ?? 'no result'}`)
  return outcome.mesh
}

const PANEL_ORDER = ['front', 'back', 'left', 'right']
const panelRank = (id) => (PANEL_ORDER.includes(id) ? PANEL_ORDER.indexOf(id) : PANEL_ORDER.length)

/** Print panels from the pattern frames, packed into the atlas at one shared scale. */
export function framePanels({ pattern, frames, atlas }) {
  // The tee's order (front, back, then the sleeves), then any other panels as the recipe lists them.
  const ids = Object.keys(frames).sort((a, b) => panelRank(a) - panelRank(b))
  const { placed } = packPanels({ boxes: ids.map((id) => frames[id]), size: atlas })
  const rects = atlasRects({ placed, size: atlas })
  return ids.map((id, index) => ({
    id,
    label: pattern.pieces.find((piece) => piece.panel === id)?.label ?? id,
    renderPanel: RENDER_SIDE[id] ?? id,
    mesh: 'body-pattern',
    uv: rects[index],
    frame: frames[id],
  }))
}

/** The draped recipe as GLB bytes, before the slim steps. */
export async function bakeRawGlb({ templateId, version, atlas = 2048, spacing, color = '#ffffff' }) {
  const template = patternTemplateFor({ templateId, templateVersion: version })
  if (!template) throw new Error(`No pattern recipe for ${templateId}@${version} (src/lib/pattern/templates.ts)`)

  const { pattern, frames } = template
  const mesh = drapeRecipe({ pattern, spacing })
  const panels = framePanels({ pattern, frames, atlas })
  const render = { pattern, renderPanels: Object.fromEntries(panels.map((panel) => [panel.id, panel.renderPanel])) }
  const panelUv = Object.fromEntries(panels.map((panel) => [panel.renderPanel, panel.uv]))
  const scene = buildPatternScene({ mesh, render, panelUv, color, seat: [0, 0, 0] })
  scene.updateMatrixWorld(true)

  const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
  return { glb: new Uint8Array(glb), panels, settled: mesh.settled, seconds: mesh.seconds, vertices: mesh.positions.length / 3 }
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] })
}

async function main() {
  const { values } = parseArgs({
    options: {
      template: { type: 'string' },
      version: { type: 'string' },
      glb: { type: 'string' },
      manifest: { type: 'string' },
      garment: { type: 'string' },
      color: { type: 'string' },
      atlas: { type: 'string', default: '2048' },
      spacing: { type: 'string' },
      'body-ratio': { type: 'string', default: '1' },
      'no-compress': { type: 'boolean', default: false },
    },
  })

  if (!values.template || !values.version) {
    console.error(
      'Usage: bake-pattern-glb.mjs --template <id> --version <n> [--glb <out.glb>] [--manifest <out.ts>]\n' +
        '         [--garment <id>] [--color #hex] [--atlas 2048] [--spacing mm] [--body-ratio 1] [--no-compress]',
    )
    process.exit(1)
  }

  const templateId = values.template
  const version = Number(values.version)
  const recipe = `${templateId}@${version}`
  const scratch = join('.bake', recipe)
  const glbPath = values.glb ?? join(scratch, `${templateId}-v${version}.glb`)
  const manifestPath = values.manifest ?? join(scratch, `${templateId}-v${version}.ts`)
  // A template already in the archive keeps its garment and colour.
  const known = resolveTemplate({ id: templateId, version })
  const garmentId = values.garment ?? (known.ok ? known.manifest.garmentId : null)
  if (!garmentId) throw new Error(`${recipe} has no garment yet: pass --garment <id>`)
  const color = values.color ?? (known.ok ? known.manifest.material.color : '#ffffff')
  const atlas = Number(values.atlas)

  const glbOut = resolve(root, glbPath)
  const manifestOut = resolve(root, manifestPath)
  mkdirSync(dirname(glbOut), { recursive: true })
  mkdirSync(dirname(manifestOut), { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'bake-pattern-'))

  let baked
  try {
    // 1. Drape, build and export.
    baked = await bakeRawGlb({ templateId, version, atlas, spacing: values.spacing ? Number(values.spacing) : undefined, color })
    if (!baked.settled) console.warn(`warning: the drape did not settle in ${baked.seconds.toFixed(1)} s`)
    const raw = join(work, 'raw.glb')
    writeFileSync(raw, baked.glb)

    // 2. The slim steps every model takes.
    const slim = join(work, 'slim.glb')
    run('node', ['scripts/simplify-parts.mjs', '--src', raw, '--out', slim, '--body-ratio', values['body-ratio']])
    if (!values['no-compress']) run('bash', ['scripts/compress-models.sh', slim])

    // 3. Manifest: regions from the frames, sha256 and bounds from the GLB.
    const spec = {
      $comment: `Baked by scripts/bake-pattern-glb.mjs from the ${recipe} pattern recipe.`,
      printUv: 'keep',
      recipe,
      templateId,
      version,
      garmentId,
      glb: slim,
      out: glbOut,
      // Served from public/ when shipped; a scratch bake is served from the repo root in dev.
      file: `/${relative(root, glbOut).replace(/^public\//, '')}`,
      manifest: manifestOut,
      generator: `scripts/bake-pattern-glb.mjs (${recipe})`,
      source: `the ${recipe} pattern recipe`,
      atlas,
      color,
      panels: baked.panels,
    }
    const specPath = join(work, 'pieces.json')
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`)
    run('node', ['scripts/build-template.mjs', '--pieces', specPath])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ recipe, glb: glbPath, manifest: manifestPath, vertices: baked.vertices, settled: baked.settled, seconds: baked.seconds }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
