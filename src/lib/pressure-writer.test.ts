import { beforeEach, describe, expect, test } from 'vitest'

import { validateCanonicalDocument } from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { getCanonicalDocument, liveStrokeLayerId, useEditorStore } from './editor-store'
import { rasterizeLayers } from './paint-atlas'

/**
 * W2: a pen's pressure is kept per point, so the stroke looks the same after
 * the pen lifts as while it drew. Mouse strokes are stored exactly as before.
 */

const store = () => useEditorStore.getState()
const SIZE = 128

function strokes() {
  return getCanonicalDocument().panels.front.layers.flatMap((layer) => (layer.kind === 'paint' ? layer.strokes : []))
}

/** Draw on the front; `pressures` undefined means a mouse. */
function draw({ pressures }: { pressures?: number[] }) {
  const count = pressures?.length ?? 4
  for (let index = 0; index < count; index += 1) {
    const point = { x: 0.2 + index * 0.15, y: 0.3 + index * 0.1 }
    const pressure = pressures?.[index]
    if (index === 0) {
      store().startStroke({ panel: 'front', point, pressure })
    } else {
      store().appendStroke({ point, pressure })
    }
  }
}

/** What the atlas shows while drawing, then once the pen lifts. */
function liveThenCommitted() {
  const live = rasterizeLayers({
    document: store().document,
    extraStroke: store().activeStroke,
    extraStrokeLayerId: liveStrokeLayerId({ stroke: store().activeStroke }),
    width: SIZE,
    height: SIZE,
  }).pixels
  store().endStroke()
  const committed = rasterizeLayers({ document: store().document, width: SIZE, height: SIZE }).pixels
  return { live, committed }
}

describe('pen pressure on the tee (W2)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('a pen stroke keeps one pressure per point and its own width', () => {
    draw({ pressures: [0.2, 0.6, 1, 0.3] })
    const factor = 0.35 + store().paintHardness * 0.65
    const width = store().paintWidth
    store().endStroke()

    const [stroke] = strokes()
    expect(stroke?.width).toBe(width)
    expect(stroke?.pressures).toHaveLength(4)
    stroke?.pressures?.forEach((pressure, index) => expect(pressure).toBeCloseTo([0.2, 0.6, 1, 0.3][index]! * factor, 10))
    expect(validateCanonicalDocument({ value: getCanonicalDocument() }).ok).toBe(true)
  })

  test('the taper survives the lift: saved pixels equal the live preview', () => {
    draw({ pressures: [0.1, 0.9, 0.9, 0.1] })
    const { live, committed } = liveThenCommitted()
    expect(committed).toEqual(live)
  })

  test('a mouse stroke stores no pressures, and the same width as before', () => {
    draw({})
    const factor = 0.35 + store().paintHardness * 0.65
    const width = store().paintWidth
    store().endStroke()

    const [stroke] = strokes()
    expect(stroke).not.toHaveProperty('pressures')
    expect(stroke?.width).toBeCloseTo((width * (0.55 + factor * 0.7)) / (0.55 + 0.7 * 0.7), 6)
    expect(serializeCanonicalDocument({ document: getCanonicalDocument() })).not.toContain('pressures')
  })

  test('a mouse stroke still looks the same once saved', () => {
    draw({})
    const { live, committed } = liveThenCommitted()
    let differing = 0
    for (let index = 0; index < live.length; index += 1) {
      if (Math.abs(live[index]! - committed[index]!) > 1) differing += 1
    }
    expect(differing).toBe(0)
  })

  test('an even pen pressure folds into the width, as a mouse does', () => {
    draw({ pressures: [0.5, 0.5, 0.5] })
    store().endStroke()
    expect(strokes()[0]).not.toHaveProperty('pressures')
  })

  test('erasers keep their taper too', () => {
    draw({})
    store().endStroke()
    store().setPaintTool({ paintTool: 'eraser' })
    draw({ pressures: [1, 0.2, 1] })
    store().endStroke()
    const eraser = strokes().find((stroke) => stroke.tool === 'eraser')
    expect(eraser?.pressures).toHaveLength(3)
  })
})
