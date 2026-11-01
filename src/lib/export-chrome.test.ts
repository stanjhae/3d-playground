import { beforeEach, describe, expect, expectTypeOf, test } from 'vitest'

import type { DesignDocument } from './design-document'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import { applyLayerEdit } from './layer-hit'
import { type AtlasBuffer, bakePublishedArt, rasterizeLayers } from './paint-atlas'
import { SELECTION_COLOR, meshOutlineVisible } from './selection-chrome'

/**
 * #156: published art and captured stills never include the selection
 * handles or bounding box. Handles are drawn only on the studio's panel
 * canvases; published art is baked from `rasterizeLayers`, and the 3D
 * cloth the stills are taken from is textured by the same function.
 */

const store = () => useEditorStore.getState()
const atlas = (document: DesignDocument) => rasterizeLayers({ document, width: 256, height: 256 })

function hex({ value }: { value: string }) {
  const n = Number.parseInt(value.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Opaque-ish pixels within a few levels of the selection colour. */
function selectionColoured({ buffer }: { buffer: AtlasBuffer }) {
  const target = hex({ value: SELECTION_COLOR })
  let count = 0

  for (let index = 0; index < buffer.pixels.length; index += 4) {
    if (
      buffer.pixels[index + 3]! > 32 &&
      Math.abs(buffer.pixels[index]! - target.r) <= 12 &&
      Math.abs(buffer.pixels[index + 1]! - target.g) <= 12 &&
      Math.abs(buffer.pixels[index + 2]! - target.b) <= 12
    ) {
      count += 1
    }
  }

  return count
}

describe('exports exclude selection chrome (#156)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
    store().addText({ content: 'HANDLES', x: 0.5, y: 0.5 })
    store().updateLayer({ layerId: store().selectedLayerId!, patch: { color: '#1a1c22' } })
    store().addGraphic({ src: '/graphics/cross-simple.svg' })
    store().updateLayer({ layerId: store().selectedLayerId!, patch: { color: '#1a1c22', rotation: 0.4 } })
  })

  test('the atlas is identical with a mark selected, mid-gesture or nothing selected', () => {
    const mark = store().selectedLayerId!
    const selected = atlas(store().document)
    const canonicalSelected = JSON.stringify(getCanonicalDocument())

    // A drag in progress is not committed: what is saved and published
    // stays as it was until release.
    const layer = store().document.layers.find((entry) => entry.id === mark)!
    const pose = 'x' in layer ? layer : null
    store().startLayerEdit({
      edit: { layerId: mark, x: pose!.x, y: pose!.y, scale: pose!.scale, rotation: pose!.rotation },
    })
    store().moveLayerEdit({
      edit: { layerId: mark, x: 0.2, y: 0.2, scale: pose!.scale, rotation: pose!.rotation },
    })
    const midGesture = atlas(store().document)
    store().endLayerEdit()
    store().undoLast()

    store().selectLayer({ selectedLayerId: null })
    const none = atlas(store().document)

    expect(selected.pixels.some((value) => value > 0)).toBe(true)
    expect(midGesture.pixels).toEqual(none.pixels)
    expect(selected.pixels).toEqual(none.pixels)
    expect(JSON.stringify(getCanonicalDocument())).toBe(canonicalSelected)
  })

  test('no pixel of the selected art is in the handle colour', () => {
    expect(store().selectedLayerId).not.toBeNull()
    expect(selectionColoured({ buffer: atlas(store().document) })).toBe(0)
  })

  test('the studio cloth (the stills’ source) matches the published atlas when no gesture is live', () => {
    const document = store().document
    expect(atlas(applyLayerEdit({ document, edit: null })).pixels).toEqual(atlas(document).pixels)
  })

  test('published art is baked from the document alone, with no selection input', () => {
    expectTypeOf<Parameters<typeof bakePublishedArt>[0]>().toEqualTypeOf<{
      document: DesignDocument
      images?: Record<string, AtlasBuffer>
    }>()
    expectTypeOf<Parameters<typeof rasterizeLayers>[0]>().not.toHaveProperty('selectedLayerId')
  })

  test('the mesh outline is off while the published views are captured', () => {
    for (const isSelected of [true, false]) {
      for (const hovered of [true, false]) {
        expect(meshOutlineVisible({ canPick: true, isSelected, hovered, capturingAngles: true })).toBe(false)
      }
    }

    expect(meshOutlineVisible({ canPick: true, isSelected: true, hovered: false, capturingAngles: false })).toBe(true)
    expect(meshOutlineVisible({ canPick: true, isSelected: false, hovered: true, capturingAngles: false })).toBe(true)
    expect(meshOutlineVisible({ canPick: false, isSelected: true, hovered: true, capturingAngles: false })).toBe(false)
  })
})
