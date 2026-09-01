import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three'
import { describe, expect, test } from 'vitest'

import {
  applyDesignOverrides,
  applyLiveOverrides,
  applyOverridesFromBases,
  captureMeshMaterials,
  cloneObjectMaterials,
  listMeshes,
  sealClothMaterial,
  stampAncestorNames,
} from './apply-overrides'

function createNamedMesh({ name }: { name: string }) {
  const mesh = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      metalness: 0,
    }),
  )
  mesh.name = name
  return mesh
}

describe('applyDesignOverrides', () => {
  test('seals blended cloth so overlapping pieces stay opaque', () => {
    const ghost = createNamedMesh({ name: 'body' })
    ghost.material.transparent = true
    ghost.material.opacity = 0.95
    ghost.material.depthWrite = false

    sealClothMaterial({ material: ghost.material })

    expect(ghost.material.transparent).toBe(false)
    expect(ghost.material.opacity).toBe(1)
    expect(ghost.material.depthWrite).toBe(true)
  })

  test('cloning a blended gown material makes it opaque cloth', () => {
    const skirt = createNamedMesh({ name: 'body-1' })
    skirt.material.transparent = true
    skirt.material.opacity = 0.95
    const root = new Group()
    root.add(skirt)

    cloneObjectMaterials({ root })

    expect(skirt.material.transparent).toBe(false)
    expect(skirt.material.opacity).toBe(1)
    expect(skirt.material.depthWrite).toBe(true)
  })

  test('fabric apply does not keep the source alpha', () => {
    const body = createNamedMesh({ name: 'body' })
    body.material.transparent = true
    body.material.opacity = 0.95
    const root = new Group()
    root.add(body)

    applyDesignOverrides({
      root,
      overrides: [{ meshName: 'body', color: '#112233' }],
    })

    expect(body.material.transparent).toBe(false)
    expect(body.material.opacity).toBe(1)
    expect(body.material.depthWrite).toBe(true)
  })

  test('returns the same root reference', () => {
    const root = new Group()
    root.name = 'garment'

    const result = applyDesignOverrides({
      root,
      overrides: [{ meshName: 'collar' }],
    })

    expect(result).toBe(root)
  })

  test('clones the hit mesh material and ignores unknown names', () => {
    const collar = createNamedMesh({ name: 'collar' })
    const lining = createNamedMesh({ name: 'lining' })
    const originalCollarMaterial = collar.material
    const originalLiningMaterial = lining.material
    const root = new Group()
    root.add(collar, lining)
    const weave = new Texture()

    applyDesignOverrides({
      root,
      overrides: [
        {
          meshName: 'collar',
          color: '#c45c26',
          roughness: 0.35,
          metalness: 0.05,
          mapId: 'silk-ivory',
        },
        {
          meshName: 'missing-panel',
          color: '#0000ff',
        },
      ],
      maps: { 'silk-ivory': weave },
    })

    expect(collar.material).not.toBe(originalCollarMaterial)
    expect(collar.material).toBeInstanceOf(MeshStandardMaterial)
    expect(collar.material.color.getHexString()).toBe('c45c26')
    expect(collar.material.roughness).toBe(0.35)
    expect(collar.material.metalness).toBe(0.05)
    expect(collar.material.userData.mapId).toBe('silk-ivory')
    expect(collar.material.map).toBeInstanceOf(Texture)
    expect(collar.material.map).not.toBe(weave)

    expect(lining.material).toBe(originalLiningMaterial)
    expect(lining.material.color.getHexString()).toBe('ffffff')
    expect(lining.material.userData.mapId).toBeUndefined()
  })

  test('applies to MeshStandardMaterial slots in a material array', () => {
    const cloth = new MeshStandardMaterial({ color: '#ffffff' })
    const trim = new MeshBasicMaterial({ color: '#000000' })
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), [cloth, trim])
    mesh.name = 'body'
    const root = new Group()
    root.add(mesh)
    const weave = new Texture()

    applyDesignOverrides({
      root,
      overrides: [{ meshName: 'body', color: '#112233', mapId: 'cotton-weave' }],
      maps: { 'cotton-weave': weave },
    })

    const [nextCloth, nextTrim] = mesh.material
    expect(nextCloth).toBeInstanceOf(MeshStandardMaterial)
    expect(nextCloth).not.toBe(cloth)
    expect(nextCloth.color.getHexString()).toBe('112233')
    expect(nextCloth.map).toBeInstanceOf(Texture)
    expect(nextCloth.map).not.toBe(weave)
    expect(nextTrim).toBe(trim)
  })
})

describe('applyOverridesFromBases', () => {
  test('restores an undone mesh after the override list shrinks', () => {
    const collar = createNamedMesh({ name: 'collar' })
    const lining = createNamedMesh({ name: 'lining' })
    const root = new Group()
    root.add(collar, lining)
    cloneObjectMaterials({ root })

    const baseMaterials = captureMeshMaterials({ root })
    const meshes = listMeshes({ root })
    const originalCollarHex = (collar.material as MeshStandardMaterial).color.getHexString()

    applyOverridesFromBases({
      meshes,
      baseMaterials,
      overrides: [
        { meshName: 'collar', color: '#c45c26', roughness: 0.2 },
        { meshName: 'lining', color: '#6b1d2a' },
      ],
    })

    expect((collar.material as MeshStandardMaterial).color.getHexString()).toBe(
      'c45c26',
    )
    expect((lining.material as MeshStandardMaterial).color.getHexString()).toBe(
      '6b1d2a',
    )

    applyOverridesFromBases({
      meshes,
      baseMaterials,
      overrides: [{ meshName: 'lining', color: '#6b1d2a' }],
    })

    expect((collar.material as MeshStandardMaterial).color.getHexString()).toBe(
      originalCollarHex,
    )
    expect((lining.material as MeshStandardMaterial).color.getHexString()).toBe(
      '6b1d2a',
    )
  })

  test('still applies after children are detached from the group', () => {
    const collar = createNamedMesh({ name: 'collar' })
    const root = new Group()
    root.add(collar)
    cloneObjectMaterials({ root })
    const baseMaterials = captureMeshMaterials({ root })
    const meshes = listMeshes({ root })
    root.remove(collar)

    applyOverridesFromBases({
      meshes,
      baseMaterials,
      overrides: [{ meshName: 'collar', color: '#112233' }],
    })

    expect((collar.material as MeshStandardMaterial).color.getHexString()).toBe(
      '112233',
    )
    expect(root.children).toHaveLength(0)
  })
})

describe('name matching', () => {
  test('paints hardware children from a group name override', () => {
    const belt = createNamedMesh({ name: 'hardware-belt' })
    const group = new Group()
    group.name = 'hardware'
    group.add(belt)
    const root = new Group()
    root.add(group)

    applyDesignOverrides({
      root,
      overrides: [{ meshName: 'hardware', color: '#6b1d2a' }],
    })

    expect((belt.material as MeshStandardMaterial).color.getHexString()).toBe(
      '6b1d2a',
    )
  })

  test('paints detached hardware from stamped ancestors', () => {
    const button = createNamedMesh({ name: 'Button01' })
    const hardware = new Group()
    hardware.name = 'hardware'
    hardware.add(button)
    const root = new Group()
    root.add(hardware)
    stampAncestorNames({ root })
    hardware.remove(button)

    applyDesignOverrides({
      root: button,
      overrides: [{ meshName: 'hardware', color: '#6b1d2a' }],
    })

    expect((button.material as MeshStandardMaterial).color.getHexString()).toBe(
      '6b1d2a',
    )
  })

  test('paints a prefixed child from the parent part name', () => {
    const skirt = createNamedMesh({ name: 'body-skirt' })
    const root = new Group()
    root.add(skirt)

    applyDesignOverrides({
      root,
      overrides: [{ meshName: 'body', color: '#112233' }],
    })

    expect((skirt.material as MeshStandardMaterial).color.getHexString()).toBe(
      '112233',
    )
  })
})

describe('applyLiveOverrides', () => {
  test('applies the final color immediately when animate is false', () => {
    const body = createNamedMesh({ name: 'body' })
    const root = new Group()
    root.add(body)
    cloneObjectMaterials({ root })
    const baseMaterials = captureMeshMaterials({ root })
    const meshes = listMeshes({ root })

    applyLiveOverrides({
      meshes,
      baseMaterials,
      overrides: [{ meshName: 'body', color: '#1a1c22' }],
      animate: false,
    })

    expect((body.material as MeshStandardMaterial).color.getHexString()).toBe(
      '1a1c22',
    )
  })

  test('holds the prior cloth color when animate is true', () => {
    const body = createNamedMesh({ name: 'body' })
    const root = new Group()
    root.add(body)
    cloneObjectMaterials({ root })
    const baseMaterials = captureMeshMaterials({ root })
    const meshes = listMeshes({ root })
    ;(body.material as MeshStandardMaterial).color.set('#c4a15a')

    applyLiveOverrides({
      meshes,
      baseMaterials,
      overrides: [{ meshName: 'body', color: '#1a1c22' }],
      animate: true,
    })

    const material = body.material as MeshStandardMaterial
    expect(material.color.getHexString()).toBe('c4a15a')
    expect((material.userData.targetColor as { getHexString: () => string }).getHexString()).toBe(
      '1a1c22',
    )
  })
})

describe('cloneObjectMaterials', () => {
  test('clones standard materials so the source cache is untouched', () => {
    const mesh = createNamedMesh({ name: 'body' })
    const original = mesh.material
    const root = new Group()
    root.add(mesh)

    cloneObjectMaterials({ root })

    expect(mesh.material).not.toBe(original)
    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial)
  })
})
