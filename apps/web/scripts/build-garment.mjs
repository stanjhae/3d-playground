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
  SphereGeometry,
  Vector2,
} from 'three'

function createSilk({ color, sheen = 1 }) {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.18,
    metalness: 0.04,
    sheen,
    sheenRoughness: 0.28,
    sheenColor: '#fff4e4',
    side: DoubleSide,
  })
}

function createLiningSilk({ color }) {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.22,
    metalness: 0.03,
    sheen: 0.7,
    sheenRoughness: 0.34,
    sheenColor: '#ffe8dc',
    side: DoubleSide,
  })
}

function createWool({ color }) {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    side: DoubleSide,
  })
}

function createBrass() {
  return new MeshPhysicalMaterial({
    color: '#c4a15a',
    roughness: 0.28,
    metalness: 0.82,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
  })
}

function latheFrom({
  name,
  points,
  segments = 96,
  material,
}) {
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

function createBodice() {
  return latheFrom({
    name: 'body',
    material: createSilk({ color: '#f4ead4' }),
    points: [
      [0.155, 0.96],
      [0.168, 1.02],
      [0.2, 1.1],
      [0.218, 1.18],
      [0.222, 1.24],
      [0.2, 1.3],
      [0.168, 1.36],
      [0.132, 1.42],
      [0.118, 1.46],
    ],
  })
}

function createSkirt() {
  return latheFrom({
    name: 'body-skirt',
    material: createSilk({ color: '#f4ead4' }),
    points: [
      [0.27, 0],
      [0.255, 0.06],
      [0.228, 0.2],
      [0.21, 0.36],
      [0.208, 0.5],
      [0.22, 0.64],
      [0.248, 0.78],
      [0.262, 0.86],
      [0.22, 0.92],
      [0.155, 0.96],
    ],
  })
}

function createTrain() {
  const mesh = latheFrom({
    name: 'body-train',
    segments: 48,
    material: createSilk({ color: '#f1e4cc', sheen: 0.85 }),
    points: [
      [0.02, 0],
      [0.18, 0.01],
      [0.3, 0.02],
      [0.34, 0.05],
      [0.22, 0.08],
    ],
  })
  mesh.scale.set(1, 1, 1.35)
  mesh.position.set(0, 0, -0.08)
  return mesh
}

function createLining() {
  return latheFrom({
    name: 'lining',
    segments: 80,
    material: createLiningSilk({ color: '#6b1d2a' }),
    points: [
      [0.25, 0.03],
      [0.21, 0.22],
      [0.198, 0.5],
      [0.23, 0.78],
      [0.148, 0.97],
      [0.19, 1.16],
      [0.188, 1.26],
      [0.14, 1.38],
      [0.1, 1.44],
    ],
  })
}

function createCollar() {
  const group = new Group()
  group.name = 'collar'

  const neck = latheFrom({
    name: 'collar',
    segments: 64,
    material: createWool({ color: '#2b241c' }),
    points: [
      [0.118, 1.455],
      [0.122, 1.462],
      [0.11, 1.468],
    ],
  })

  const leftStrap = new Mesh(
    new CylinderGeometry(0.008, 0.007, 0.16, 16),
    createSilk({ color: '#f4ead4' }),
  )
  leftStrap.name = 'collar-strap-left'
  leftStrap.position.set(-0.1, 1.5, 0.01)
  leftStrap.rotation.z = 0.55
  leftStrap.castShadow = true

  const rightStrap = leftStrap.clone()
  rightStrap.name = 'collar-strap-right'
  rightStrap.position.x = 0.1
  rightStrap.rotation.z = -0.55

  group.add(neck, leftStrap, rightStrap)
  return group
}

function createHardware() {
  const group = new Group()
  group.name = 'hardware'

  for (const [index, y] of [1.34, 1.26, 1.18, 1.1].entries()) {
    const button = new Mesh(new SphereGeometry(0.011, 16, 12), createBrass())
    button.name = `hardware-button-${index + 1}`
    button.position.set(0, y, -0.155)
    button.castShadow = true
    group.add(button)
  }

  const clasp = new Mesh(new BoxGeometry(0.04, 0.014, 0.01), createBrass())
  clasp.name = 'hardware-clasp'
  clasp.position.set(0, 1.45, 0.12)
  group.add(clasp)

  return group
}

const garment = new Group()
garment.name = 'garment'
garment.add(
  createBodice(),
  createSkirt(),
  createTrain(),
  createLining(),
  createCollar(),
  createHardware(),
)

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
  'garment-house.glb',
)
writeFileSync(outPath, Buffer.from(glb))
console.log(
  'wrote',
  outPath,
  glb.byteLength,
  '(does not replace the credited column at public/models/garment.glb)',
)
