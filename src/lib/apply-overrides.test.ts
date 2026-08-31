import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three'
import { describe, expect, test } from 'vitest'

import { applyDesignOverrides, cloneObjectMaterials } from './apply-overrides'

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
    expect(collar.material.map).toBe(weave)

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
    expect(nextCloth.map).toBe(weave)
    expect(nextTrim).toBe(trim)
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
