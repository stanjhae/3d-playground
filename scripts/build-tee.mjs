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
  DoubleSide,
  ExtrudeGeometry,
  Mesh,
  MeshPhysicalMaterial,
  Path,
  Scene,
  Shape,
} from 'three'

function cotton() {
  return new MeshPhysicalMaterial({
    color: '#f3efe6',
    roughness: 0.86,
    metalness: 0,
    side: DoubleSide,
  })
}

function teeShape({ neck }) {
  const shape = new Shape()
  shape.moveTo(-0.2, 0.38)
  shape.lineTo(-0.21, 0.92)
  shape.lineTo(-0.46, 0.78)
  shape.lineTo(-0.5, 0.98)
  shape.lineTo(-0.2, 1.16)
  shape.lineTo(-0.1, 1.22)

  if (neck === 'v') {
    shape.lineTo(0, 1.04)
    shape.lineTo(0.1, 1.22)
  } else {
    shape.quadraticCurveTo(0, 1.14, 0.1, 1.22)
  }

  shape.lineTo(0.2, 1.16)
  shape.lineTo(0.5, 0.98)
  shape.lineTo(0.46, 0.78)
  shape.lineTo(0.21, 0.92)
  shape.lineTo(0.2, 0.38)
  shape.closePath()

  const hole = new Path()
  if (neck === 'v') {
    hole.moveTo(-0.07, 1.18)
    hole.lineTo(0, 1.06)
    hole.lineTo(0.07, 1.18)
    hole.quadraticCurveTo(0, 1.2, -0.07, 1.18)
  } else {
    hole.absellipse(0, 1.2, 0.07, 0.035, 0, Math.PI * 2, true)
  }
  shape.holes.push(hole)
  return shape
}

function assignPanelUvs({ geometry }) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const width = Math.max(1e-6, box.max.x - box.min.x)
  const height = Math.max(1e-6, box.max.y - box.min.y)
  const midZ = (box.min.z + box.max.z) / 2
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const panelX = (x - box.min.x) / width
    const panelY = (y - box.min.y) / height
    const isFront = z >= midZ - 1e-4
    uv.setXY(index, isFront ? panelX * 0.5 : 0.5 + panelX * 0.5, panelY)
  }

  uv.needsUpdate = true
}

function createTee({ neck }) {
  const geometry = new ExtrudeGeometry(teeShape({ neck }), {
    depth: 0.18,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 24,
  })
  geometry.translate(0, 0, -0.09)
  geometry.computeVertexNormals()
  assignPanelUvs({ geometry })

  const mesh = new Mesh(geometry, cotton())
  mesh.name = 'body'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

async function writeTee({ neck, filename }) {
  const scene = new Scene()
  scene.add(createTee({ neck }))

  const exporter = new GLTFExporter()
  const glb = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
  })

  if (!(glb instanceof ArrayBuffer)) {
    throw new Error('Expected a binary GLB')
  }

  const outPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'public',
    'models',
    filename,
  )
  writeFileSync(outPath, Buffer.from(glb))
  console.log('wrote', outPath, glb.byteLength)
}

await writeTee({ neck: 'crew', filename: 'tee.glb' })
await writeTee({ neck: 'v', filename: 'tee-v.glb' })
