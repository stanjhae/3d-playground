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
  MeshStandardMaterial,
  Scene,
  TorusGeometry,
  Vector2,
} from 'three'

function createWool({ color }) {
  return new MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
    side: DoubleSide,
  })
}

function createSilk({ color }) {
  return new MeshStandardMaterial({
    color,
    roughness: 0.18,
    metalness: 0.05,
    side: DoubleSide,
  })
}

function createBrass() {
  return new MeshStandardMaterial({
    color: '#c4a15a',
    roughness: 0.28,
    metalness: 0.85,
  })
}

function createGownBody() {
  const points = [
    new Vector2(0.3, 0),
    new Vector2(0.24, 0.18),
    new Vector2(0.2, 0.4),
    new Vector2(0.22, 0.58),
    new Vector2(0.26, 0.72),
    new Vector2(0.19, 0.9),
    new Vector2(0.23, 1.08),
    new Vector2(0.21, 1.2),
    new Vector2(0.12, 1.34),
    new Vector2(0.09, 1.4),
  ]

  const mesh = new Mesh(new LatheGeometry(points, 72), createSilk({ color: '#f4ead4' }))
  mesh.name = 'body'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createLining() {
  const points = [
    new Vector2(0.28, 0.04),
    new Vector2(0.22, 0.2),
    new Vector2(0.18, 0.42),
    new Vector2(0.2, 0.6),
    new Vector2(0.24, 0.72),
    new Vector2(0.17, 0.9),
    new Vector2(0.21, 1.08),
    new Vector2(0.19, 1.18),
    new Vector2(0.1, 1.3),
  ]

  const mesh = new Mesh(new LatheGeometry(points, 64), createSilk({ color: '#6b1d2a' }))
  mesh.name = 'lining'
  return mesh
}

function createCollar() {
  const mesh = new Mesh(new TorusGeometry(0.105, 0.022, 20, 56), createWool({ color: '#2b241c' }))
  mesh.name = 'collar'
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 1.4
  mesh.castShadow = true
  return mesh
}

function createHardware() {
  const group = new Group()
  group.name = 'hardware'

  const belt = new Mesh(new TorusGeometry(0.2, 0.012, 12, 48), createBrass())
  belt.name = 'hardware-belt'
  belt.rotation.x = Math.PI / 2
  belt.position.y = 0.9
  group.add(belt)

  const buckle = new Mesh(new BoxGeometry(0.055, 0.03, 0.018), createBrass())
  buckle.name = 'hardware-buckle'
  buckle.position.set(0.2, 0.9, 0.02)
  group.add(buckle)

  for (const [index, x] of [-0.035, 0, 0.035].entries()) {
    const button = new Mesh(new CylinderGeometry(0.012, 0.012, 0.006, 20), createBrass())
    button.name = `hardware-button-${index + 1}`
    button.rotation.x = Math.PI / 2
    button.position.set(x, 1.12, 0.2)
    group.add(button)
  }

  return group
}

const garment = new Group()
garment.name = 'garment'
garment.add(createGownBody(), createLining(), createCollar(), createHardware())

const scene = new Scene()
scene.add(garment)

const exporter = new GLTFExporter()
const glb = await exporter.parseAsync(scene, { binary: true, onlyVisible: false })

if (!(glb instanceof ArrayBuffer)) {
  throw new Error('Expected a binary GLB')
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'garment.glb')
writeFileSync(outPath, Buffer.from(glb))
console.log('wrote', outPath, glb.byteLength)
