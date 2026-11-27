import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three'
import { describe, expect, test } from 'vitest'

import {
  NEUTRAL_CLOTH_COLOR,
  applyDesignOverrides,
  captureMeshMaterials,
  cloneObjectMaterials,
  listMeshes,
  neutraliseBakedCloth,
  applyOverridesFromBases,
  stampAncestorNames,
} from './apply-overrides'
import { overrideMatchesMesh } from './mesh-match'
import { currentTemplateFor } from './template-manifest'

/**
 * Tester pass 3: the 3D hoodie was green with a white hood and a Style3D logo
 * while its flat panels were cream. Downloaded models carry their original
 * look as a baked colour texture, and three.js multiplies the garment colour
 * into it. The studio takes that texture off the cloth, so the 3D cloth is
 * exactly the garment colour, hood and skirt included.
 */

function bakedMesh({ name, color = '#2f5233' }: { name: string; color?: string }) {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#cccccc', map: new Texture(), roughness: 0.9 }))
  mesh.name = name
  // What the baked texture looked like, for the test's own reading.
  mesh.userData.bakedLook = color
  return mesh
}

function seatedModel({ names }: { names: string[] }) {
  const root = new Group()
  root.add(...names.map((name) => bakedMesh({ name })))
  cloneObjectMaterials({ root })
  neutraliseBakedCloth({ root })
  stampAncestorNames({ root })
  return root
}

const material = (mesh: Mesh) => mesh.material as MeshStandardMaterial
const meshNamed = (root: Group, name: string) => root.getObjectByName(name) as Mesh

describe('neutraliseBakedCloth', () => {
  test('takes the baked colour texture off the cloth and starts it at the template colour', () => {
    const root = seatedModel({ names: ['body', 'body-5', 'skirt'] })

    for (const mesh of listMeshes({ root })) {
      expect(material(mesh).map).toBeNull()
      expect(`#${material(mesh).color.getHexString()}`).toBe(NEUTRAL_CLOTH_COLOR)
      expect(mesh.userData.bakedCloth).toBe(true)
    }
  })

  test('the neutral cloth is every GLB template’s own material colour, so a new design looks as its flat panels do', () => {
    for (const templateId of ['hoodie', 'slip', 'mixed', 'coat', 'suit', 'overall', 'tailored', 'gown']) {
      expect(currentTemplateFor({ templateId }).material.color).toBe(NEUTRAL_CLOTH_COLOR)
    }
  })

  test('leaves hardware (buttons, zips) and untextured cloth alone', () => {
    const root = new Group()
    const button = bakedMesh({ name: 'hardware-3' })
    const plain = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#9b9b9b' }))
    plain.name = 'body-front'
    root.add(button, plain)
    neutraliseBakedCloth({ root })

    expect(material(button).map).not.toBeNull()
    expect(button.userData.bakedCloth).toBeUndefined()
    expect(`#${material(plain).color.getHexString()}`).toBe('#9b9b9b')
    expect(plain.userData.bakedCloth).toBeUndefined()
  })

  test('the garment colour reaches the whole cloth: body, hood and a skirt with its own name', () => {
    const root = seatedModel({ names: ['body', 'body-5', 'body-6', 'skirt', 'skirt-1'] })
    applyDesignOverrides({ root, overrides: [{ meshName: 'body', color: '#6b1d2a', roughness: 0.86, metalness: 0 }] })

    for (const mesh of listMeshes({ root })) {
      expect(`#${material(mesh).color.getHexString()}`, mesh.name).toBe('#6b1d2a')
      expect(material(mesh).map, mesh.name).toBeNull()
    }
  })

  test('an override that names a part still wins over the garment colour (the cotton & leather look)', () => {
    const root = seatedModel({ names: ['body', 'skirt'] })
    applyDesignOverrides({
      root,
      overrides: [
        { meshName: 'skirt', color: '#4a2f22' },
        { meshName: 'body', color: '#f3efe6' },
      ],
    })

    expect(`#${material(meshNamed(root, 'skirt')).color.getHexString()}`).toBe('#4a2f22')
    expect(`#${material(meshNamed(root, 'body')).color.getHexString()}`).toBe('#f3efe6')
  })

  test('a colour change and back restores the neutral cloth, never the baked texture', () => {
    const root = seatedModel({ names: ['body-3', 'skirt'] })
    const meshes = listMeshes({ root })
    const bases = captureMeshMaterials({ root })
    applyOverridesFromBases({ meshes, baseMaterials: bases, overrides: [{ meshName: 'body', color: '#6b7c4a' }] })
    applyOverridesFromBases({ meshes, baseMaterials: bases, overrides: [] })

    for (const mesh of meshes) {
      expect(material(mesh).map).toBeNull()
      expect(`#${material(mesh).color.getHexString()}`).toBe(NEUTRAL_CLOTH_COLOR)
    }
  })
})

/** Node's file reader; tests run in Vitest, not the browser bundle. */
async function readBytes({ path }: { path: string }) {
  const { readFileSync } = (await import(
    // @ts-expect-error Node built-in
    'node:fs'
  )) as { readFileSync: (filePath: string) => Uint8Array<ArrayBuffer> }
  return readFileSync(path)
}

type GltfJson = {
  nodes: Array<{ name?: string; mesh?: number }>
  meshes: Array<{ primitives: Array<{ material?: number }> }>
  materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }>
}

function glbJson({ bytes }: { bytes: Uint8Array }) {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GltfJson
}

/**
 * The real models (audit for tester pass 3). Every one downloaded from
 * Style3D bakes its original colours into its cloth: the hoodie's green, white
 * hood and logo; the slip's, coat's, tailored suit's and overall's black or
 * dark denim; the shirt & skirt's black skirt; the suit's and gown's white.
 * Every printed piece either carries the `body` name or is baked cloth, so
 * the garment colour reaches all of it once the texture is off.
 */
describe.each(['hoodie', 'slip', 'mixed', 'coat', 'suit', 'overall', 'tailored', 'gown'])('%s model', (templateId) => {
  const manifest = currentTemplateFor({ templateId })

  test('its baked colour textures are all on cloth, which the studio takes them off', async () => {
    const json = glbJson({ bytes: await readBytes({ path: `public${manifest.geometry.file}` }) })
    const baked = (node: { mesh?: number }) =>
      node.mesh !== undefined &&
      json.meshes[node.mesh]!.primitives.some((primitive) => json.materials?.[primitive.material ?? -1]?.pbrMetallicRoughness?.baseColorTexture !== undefined)
    const cloth = json.nodes.filter((node) => node.mesh !== undefined && !/^hardware(-\d+)?$/.test(node.name ?? ''))

    // The texture this fix exists for: every downloaded model has one.
    expect(cloth.some(baked)).toBe(true)

    // Every printed mesh takes the garment colour: by name, or as baked cloth.
    const printed = new Set(Object.values(manifest.regions).flatMap((region) => region.mesh.split(' ')))

    for (const name of printed) {
      const node = json.nodes.find((entry) => entry.name === name)!
      expect(overrideMatchesMesh({ meshName: 'body', nodeName: name }) || baked(node), name).toBe(true)
    }

    // Hardware with a texture keeps it (the tailored suit's buttons use a palette).
    for (const node of cloth) {
      expect(/^(body|skirt)(-\d+)?$/.test(node.name ?? ''), node.name).toBe(true)
    }
  })
})
