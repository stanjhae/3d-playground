// Simplify a seated garment by panel kind, after `ingest-garment.py` and
// before `compress-models.sh`. Style3D trims (stitches, buttons, belts)
// are often dense and disconnected, so a global simplify crushes the cloth
// and leaves the trims. This one cuts `hardware-*` nodes hard and, only if
// asked, trims `body-*` cloth gently with its panel borders locked.
//
//   node scripts/simplify-parts.mjs --src seated.glb --out simplified.glb \
//     --hardware-ratio 0.05 --hardware-error 0.01 --body-ratio 0.7
import { parseArgs } from 'node:util'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { simplifyPrimitive, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptSimplifier } from 'meshoptimizer'

const BODY_ERROR = 0.0005

const { values } = parseArgs({
  options: {
    src: { type: 'string' },
    out: { type: 'string' },
    'hardware-ratio': { type: 'string', default: '1' },
    'hardware-error': { type: 'string', default: '0.01' },
    'body-ratio': { type: 'string', default: '1' },
  },
})

if (!values.src || !values.out) {
  console.error('Usage: simplify-parts.mjs --src <glb> --out <glb> [--hardware-ratio n] [--hardware-error n] [--body-ratio n]')
  process.exit(1)
}

const hardwareRatio = Number(values['hardware-ratio'])
const hardwareError = Number(values['hardware-error'])
const bodyRatio = Number(values['body-ratio'])

await MeshoptSimplifier.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

const document = await io.read(values.src)
await document.transform(weld())

const triangles = {}
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const kind = node.getName().split('-')[0]

  for (const primitive of mesh.listPrimitives()) {
    if (kind === 'hardware' && hardwareRatio < 1) {
      simplifyPrimitive(primitive, {
        simplifier: MeshoptSimplifier,
        ratio: hardwareRatio,
        error: hardwareError,
        lockBorder: false,
      })
    } else if (kind !== 'hardware' && bodyRatio < 1) {
      simplifyPrimitive(primitive, {
        simplifier: MeshoptSimplifier,
        ratio: bodyRatio,
        error: BODY_ERROR,
        lockBorder: true,
      })
    }
    const indices = primitive.getIndices()
    triangles[kind] = (triangles[kind] ?? 0) + (indices ? indices.getCount() / 3 : 0)
  }
}

await io.write(values.out, document)
console.log(JSON.stringify({ out: values.out, triangles }))
