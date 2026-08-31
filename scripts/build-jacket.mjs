import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (typeof FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null
    onloadend = null

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
    }
  }
}

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  Scene,
  Vector2,
} from 'three'

function wool({ color }) {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    side: DoubleSide,
  })
}

function silk({ color }) {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.2,
    metalness: 0.04,
    sheen: 0.8,
    sheenRoughness: 0.3,
    sheenColor: '#fff4e4',
    side: DoubleSide,
  })
}

function brass() {
  return new MeshPhysicalMaterial({
    color: '#c4a15a',
    roughness: 0.3,
    metalness: 0.8,
  })
}

function lathe({ name, points, material, segments = 64 }) {
  const mesh = new Mesh(
    new LatheGeometry(
      points.map(([x, y]) => new Vector2(x, y)),
      segments,
    ),
    material,
  )
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createBody() {
  const group = new Group()
  group.name = 'body'

  const torso = lathe({
    name: 'body',
    material: wool({ color: '#2b241c' }),
    points: [
      [0.22, 0.72],
      [0.24, 0.82],
      [0.26, 0.98],
      [0.255, 1.12],
      [0.24, 1.24],
      [0.21, 1.34],
      [0.18, 1.4],
    ],
  })

  const leftSleeve = new Mesh(
    new CylinderGeometry(0.055, 0.07, 0.62, 24),
    wool({ color: '#2b241c' }),
  )
  leftSleeve.name = 'body-sleeve-left'
  leftSleeve.position.set(-0.28, 1.12, 0)
  leftSleeve.rotation.z = 1.05
  leftSleeve.castShadow = true

  const rightSleeve = leftSleeve.clone()
  rightSleeve.name = 'body-sleeve-right'
  rightSleeve.position.x = 0.28
  rightSleeve.rotation.z = -1.05

  group.add(torso, leftSleeve, rightSleeve)
  return group
}

function createLining() {
  return lathe({
    name: 'lining',
    material: silk({ color: '#6b1d2a' }),
    points: [
      [0.2, 0.74],
      [0.22, 0.9],
      [0.23, 1.1],
      [0.21, 1.28],
      [0.16, 1.38],
    ],
  })
}

function createCollar() {
  const group = new Group()
  group.name = 'collar'

  const leftLapel = new Mesh(
    new BoxGeometry(0.12, 0.28, 0.02),
    wool({ color: '#1f1a16' }),
  )
  leftLapel.name = 'collar'
  leftLapel.position.set(-0.08, 1.28, 0.2)
  leftLapel.rotation.set(-0.15, 0.35, 0.2)
  leftLapel.castShadow = true

  const rightLapel = leftLapel.clone()
  rightLapel.name = 'collar-lapel-right'
  rightLapel.position.x = 0.08
  rightLapel.rotation.y = -0.35
  rightLapel.rotation.z = -0.2

  group.add(leftLapel, rightLapel)
  return group
}

function createHardware() {
  const group = new Group()
  group.name = 'hardware'

  for (const [index, y] of [1.18, 1.08, 0.98].entries()) {
    const button = new Mesh(new CylinderGeometry(0.012, 0.012, 0.008, 16), brass())
    button.name = `hardware-button-${index + 1}`
    button.rotation.x = Math.PI / 2
    button.position.set(0.02, y, 0.24)
    button.castShadow = true
    group.add(button)
  }

  return group
}

const garment = new Group()
garment.name = 'garment'
garment.add(createBody(), createLining(), createCollar(), createHardware())

const scene = new Scene()
scene.add(garment)

const exporter = new GLTFExporter()
const glb = await exporter.parseAsync(scene, { binary: true, onlyVisible: false })

if (!(glb instanceof ArrayBuffer)) {
  throw new Error('Expected a binary GLB')
}

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'models',
  'jacket.glb',
)
writeFileSync(outPath, Buffer.from(glb))
console.log('wrote', outPath, glb.byteLength)
