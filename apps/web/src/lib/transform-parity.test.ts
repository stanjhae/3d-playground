import { beforeEach, describe, expect, test } from 'vitest'

import type { PanelId } from './design-document'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import { rasterizeLayers } from './paint-atlas'
import { NUDGE_STEP, NUDGE_STEP_LARGE } from './studio-keys'
import { TRANSFORM_FIELDS, parseField, stepField, type TransformKey } from './transform-fields'

/**
 * #156: the same target reached by dragging, by typing in the inspector's
 * number fields and by keyboard nudges gives an identical canonical
 * document and identical atlas pixels.
 */

const store = () => useEditorStore.getState()
const canonical = () => JSON.stringify(getCanonicalDocument())
const pixels = () => rasterizeLayers({ document: store().document, width: 128, height: 128 }).pixels

type Pose = { x: number; y: number; scale: number; rotation: number }

function pose(layerId: string): Pose {
  const layer = store().document.layers.find((entry) => entry.id === layerId)

  if (!layer || !('x' in layer)) {
    throw new Error('not placeable')
  }

  return { x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation }
}

/** A pointer drag: many moves, one commit on release (as PaintCanvas does). */
function dragTo({ layerId, target }: { layerId: string; target: Partial<Pose> }) {
  const start = { layerId, ...pose(layerId) }
  const end = { ...start, ...target }
  store().startLayerEdit({ edit: start })

  for (let index = 1; index <= 10; index += 1) {
    const t = index / 10
    store().moveLayerEdit({
      edit: {
        layerId,
        x: start.x + (end.x - start.x) * t * 1.3,
        y: start.y + (end.y - start.y) * t * 0.7,
        scale: start.scale + (end.scale - start.scale) * t,
        rotation: start.rotation + (end.rotation - start.rotation) * t,
      },
    })
  }

  store().moveLayerEdit({ edit: end })
  store().endLayerEdit()
}

/** Typing in the inspector: one commit per field, as TechInspector does. */
function typeInto({ layerId, values }: { layerId: string; values: Partial<Record<TransformKey, string>> }) {
  for (const [key, text] of Object.entries(values) as [TransformKey, string][]) {
    const parsed = parseField({ field: TRANSFORM_FIELDS[key], text })

    if (!parsed.ok) {
      throw new Error(parsed.message)
    }

    store().updateLayer({ layerId, patch: { [key]: parsed.value } })
  }
}

/** Arrow presses in an inspector field: one commit each. */
function arrowInto({ layerId, key, presses, large = false }: {
  layerId: string
  key: TransformKey
  presses: number
  large?: boolean
}) {
  for (let index = 0; index < Math.abs(presses); index += 1) {
    const stepped = stepField({
      field: TRANSFORM_FIELDS[key],
      value: pose(layerId)[key],
      direction: presses > 0 ? 1 : -1,
      large,
    })

    if (!stepped.ok) {
      throw new Error(stepped.message)
    }

    store().updateLayer({ layerId, patch: { [key]: stepped.value } })
  }
}

function nudge({ layerId, dx, dy, now }: { layerId: string; dx: number; dy: number; now: number }) {
  store().nudgeLayer({ layerId, dx, dy, now })
}

/** Apply `reach`, record the result, and undo back to the start. */
function outcome({ reach }: { reach: () => void }) {
  const before = store().undoCount
  reach()
  const result = { document: canonical(), pixels: pixels(), steps: store().undoCount - before }

  while (store().undoCount > before) {
    store().undoLast()
  }

  return result
}

function addWord({ panel }: { panel: PanelId }) {
  store().setPaintPanel({ paintPanel: panel })
  store().addText({ content: 'PARITY', panel, x: 0.38, y: 0.38 })
  return store().selectedLayerId!
}

describe('drag, number entry and nudge reach identical documents (#156)', () => {
  beforeEach(() => {
    store().reset()
  })

  for (const panel of ['front', 'back'] as const) {
    test(`position on the ${panel} (the back renders mirrored)`, () => {
      const word = addWord({ panel })
      const start = canonical()

      const byDrag = outcome({ reach: () => dragTo({ layerId: word, target: { x: 0.45, y: 0.6 } }) })
      expect(canonical()).toBe(start)

      const byNumber = outcome({ reach: () => typeInto({ layerId: word, values: { x: '45', y: '60' } }) })
      const byNudge = outcome({
        reach: () => {
          let now = 1_000

          for (let index = 0; index < 7; index += 1) {
            nudge({ layerId: word, dx: NUDGE_STEP, dy: 0, now: (now += 50) })
          }

          for (let index = 0; index < 4; index += 1) {
            nudge({ layerId: word, dx: 0, dy: NUDGE_STEP_LARGE, now: (now += 50) })
          }

          for (let index = 0; index < 2; index += 1) {
            nudge({ layerId: word, dx: 0, dy: NUDGE_STEP, now: (now += 50) })
          }
        },
      })
      const byArrows = outcome({
        reach: () => {
          arrowInto({ layerId: word, key: 'x', presses: 7 })
          arrowInto({ layerId: word, key: 'y', presses: 2, large: true })
          arrowInto({ layerId: word, key: 'y', presses: 2 })
        },
      })

      expect(byDrag.document).not.toBe(start)
      expect(byNumber.document).toBe(byDrag.document)
      expect(byNudge.document).toBe(byDrag.document)
      expect(byArrows.document).toBe(byDrag.document)
      expect(byNumber.pixels).toEqual(byDrag.pixels)
      expect(byNudge.pixels).toEqual(byDrag.pixels)
      expect(byArrows.pixels).toEqual(byDrag.pixels)

      // One step for the drag, one per typed field, one for the merged
      // nudges, one per arrow press.
      expect(byDrag.steps).toBe(1)
      expect(byNumber.steps).toBe(2)
      expect(byNudge.steps).toBe(1)
      expect(byArrows.steps).toBe(11)
    })
  }

  test('size and rotation by drag and by number entry', () => {
    const word = addWord({ panel: 'front' })
    const target = {
      scale: (parseField({ field: TRANSFORM_FIELDS.scale, text: '32' }) as { value: number }).value,
      rotation: (parseField({ field: TRANSFORM_FIELDS.rotation, text: '-30' }) as { value: number }).value,
    }

    const byDrag = outcome({ reach: () => dragTo({ layerId: word, target }) })
    const byNumber = outcome({ reach: () => typeInto({ layerId: word, values: { scale: '32', rotation: '-30' } }) })
    const byArrows = outcome({
      reach: () => {
        const startDegrees = Math.round(TRANSFORM_FIELDS.scale.toDisplay(pose(word).scale))
        arrowInto({ layerId: word, key: 'scale', presses: 32 - startDegrees })
        arrowInto({ layerId: word, key: 'rotation', presses: -3, large: true })
      },
    })

    expect(byNumber.document).toBe(byDrag.document)
    expect(byNumber.pixels).toEqual(byDrag.pixels)
    expect(byArrows.document).toBe(byDrag.document)
    expect(byArrows.pixels).toEqual(byDrag.pixels)
  })

  test('a typed commit is one undo step, and undo restores the exact document', () => {
    const word = addWord({ panel: 'front' })
    const start = canonical()
    const steps = store().undoCount

    typeInto({ layerId: word, values: { x: '72.5' } })
    expect(store().undoCount).toBe(steps + 1)
    expect(pose(word).x).toBe(0.725)

    store().undoLast()
    expect(store().undoCount).toBe(steps)
    expect(canonical()).toBe(start)
  })
})
