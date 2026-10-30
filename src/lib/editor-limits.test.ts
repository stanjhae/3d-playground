import { beforeEach, describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type CanonicalLayer,
  CANONICAL_LIMITS,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { createEmptyDesign } from './design-schema'
import {
  createTeeEngine,
  limitOverages,
  nearLimit,
  panelLimitCounters,
  runTeeCommand,
  runTranslated,
} from './editor-canonical'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import { replaceDocument } from './canonical-commands'

/** E09 #162: the editor refuses what the validator would, before a save. */

const store = () => useEditorStore.getState()
const GRAPHIC = '/graphics/cross-simple.svg'
const MAX_LAYERS = CANONICAL_LIMITS.layersPerPanel

function textLayer(id: string, content = 'FLP'): CanonicalLayer {
  return {
    id,
    kind: 'text',
    visible: true,
    opacity: 1,
    x: 0.5,
    y: 0.5,
    scale: 0.1,
    rotation: 0,
    content,
    face: 'sans',
    color: '#1a1c22',
  }
}

function documentWith({ front }: { front: CanonicalLayer[] }): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.panels.front.layers = front
  return document
}

function frontLayerCount() {
  return getCanonicalDocument().panels.front.layers.length
}

function expectValid() {
  expect(validateCanonicalDocument({ value: getCanonicalDocument() }).ok).toBe(true)
}

function cloud() {
  return { designId: 'd-1', title: 'Over', headSeq: 1 } as Parameters<
    ReturnType<typeof store>['loadCanonical']
  >[0]['cloud']
}

describe('canonical limits in the editor (E09 #162)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('a panel at its layer limit refuses another layer with an actionable message', () => {
    for (let index = 0; index < MAX_LAYERS; index += 1) {
      store().addGraphic({ src: GRAPHIC })
    }

    expect(frontLayerCount()).toBe(MAX_LAYERS)
    expect(store().limitNotice).toBeNull()
    const { revision, undoCount } = store()

    store().addGraphic({ src: GRAPHIC })

    expect(frontLayerCount()).toBe(MAX_LAYERS)
    expect(store().limitNotice).toBe(
      `The front has ${MAX_LAYERS} of ${MAX_LAYERS} layers. Delete one to add more.`,
    )
    expect(store()).toMatchObject({ revision, undoCount })
    expectValid()
  })

  test('typing, duplicating and uploading are refused at the limit too', () => {
    for (let index = 0; index < MAX_LAYERS; index += 1) {
      store().addText({ content: `W${index}` })
    }

    const last = store().selectedLayerId!

    store().addText({ content: 'ONE MORE' })
    expect(frontLayerCount()).toBe(MAX_LAYERS)
    // The refused word stays in the draft and the selection stays put.
    expect(store().selectedLayerId).toBe(last)

    store().duplicateLayer({ layerId: last })
    expect(frontLayerCount()).toBe(MAX_LAYERS)

    store().addUploadedImage({ assetId: 'up_0123456789abcdef', aspect: 1, src: GRAPHIC })
    expect(frontLayerCount()).toBe(MAX_LAYERS)
    expect(store().limitNotice).toContain('Delete one to add more')
    expectValid()
  })

  test('deleting a layer clears the refusal and makes room again', () => {
    for (let index = 0; index < MAX_LAYERS; index += 1) {
      store().addGraphic({ src: GRAPHIC })
    }

    store().addGraphic({ src: GRAPHIC })
    expect(store().limitNotice).not.toBeNull()

    store().removeLayer({ layerId: store().selectedLayerId! })
    expect(store().limitNotice).toBeNull()

    store().addGraphic({ src: GRAPHIC })
    expect(frontLayerCount()).toBe(MAX_LAYERS)
  })

  test('text past the length limit is refused, never cut', () => {
    store().addText({ content: 'SHORT' })
    const id = store().selectedLayerId!
    const long = 'x'.repeat(CANONICAL_LIMITS.textLength + 1)

    store().updateLayer({ layerId: id, patch: { content: long } })

    const layer = getCanonicalDocument().panels.front.layers[0]
    expect(layer?.kind === 'text' ? layer.content : null).toBe('SHORT')
    expect(store().limitNotice).toContain(`up to ${CANONICAL_LIMITS.textLength} characters`)
  })

  test('a stroke stops inking at the point limit instead of being lost', () => {
    store().startStroke({ panel: 'front', point: { x: 0.1, y: 0.1 } })

    for (let index = 0; index < CANONICAL_LIMITS.pointsPerStroke + 20; index += 1) {
      store().appendStroke({ point: { x: 0.1 + (index % 800) / 1000, y: 0.2 } })
    }

    expect(store().activeStroke?.points).toHaveLength(CANONICAL_LIMITS.pointsPerStroke)
    expect(store().limitNotice).toContain('Lift and start a new stroke')

    store().endStroke()

    const paint = getCanonicalDocument().panels.front.layers[0]
    expect(paint?.kind === 'paint' ? paint.strokes[0]?.points.length : 0).toBe(
      CANONICAL_LIMITS.pointsPerStroke * 2,
    )
    expect(store().limitNotice).toBeNull()
    expectValid()
  })

  test('a full paint layer overflows into a new one; a full panel refuses the stroke', () => {
    const strokes = Array.from({ length: CANONICAL_LIMITS.strokesPerLayer }, (_, index) => ({
      id: `s${index}`,
      tool: 'brush' as const,
      color: '#1a1c22' as const,
      width: 0.02,
      opacity: 1,
      points: [0.1, 0.1, 0.2, 0.2],
    }))
    const full: CanonicalLayer = { id: 'paint-front', kind: 'paint', visible: true, opacity: 1, strokes }
    const stroke = {
      type: 'addStroke' as const,
      stroke: {
        id: 'ink-next',
        panel: 'front' as const,
        color: '#1a1c22',
        width: 0.024,
        tool: 'brush' as const,
        points: [
          { x: 0.3, y: 0.3, p: 0.8 },
          { x: 0.4, y: 0.4, p: 0.8 },
        ],
      },
    }

    let engine = createTeeEngine()
    engine = { ...engine, stack: replaceDocument({ stack: engine.stack, document: documentWith({ front: [full] }) }) }
    const overflow = runTranslated({ engine, command: stroke })

    expect(overflow.issues).toBeUndefined()
    expect(overflow.changed).toBe(true)
    expect(overflow.engine.stack.document.panels.front.layers.map((layer) => layer.id)).toEqual([
      'paint-front',
      'paint-front-ink-next',
    ])

    const crowded = documentWith({
      front: [full, ...Array.from({ length: MAX_LAYERS - 1 }, (_, index) => textLayer(`t${index}`))],
    })
    engine = { ...engine, stack: replaceDocument({ stack: engine.stack, document: crowded }) }
    const refused = runTranslated({ engine, command: stroke })

    expect(refused.changed).toBe(false)
    expect(refused.refusal).toBe(`The front has ${MAX_LAYERS} of ${MAX_LAYERS} layers. Delete one to add more.`)
  })

  test('counters cover the panel and only show near a limit', () => {
    const document = documentWith({
      front: Array.from({ length: 32 }, (_, index) => textLayer(`t${index}`, 'x'.repeat(index + 1))),
    })
    const counters = panelLimitCounters({ document, panel: 'front' })

    expect(counters.map((counter) => [counter.kind, counter.used, counter.max])).toEqual([
      ['layers', 32, MAX_LAYERS],
      ['strokes', 0, CANONICAL_LIMITS.strokesPerLayer],
      ['points', 0, CANONICAL_LIMITS.pointsPerStroke],
      ['text', 32, CANONICAL_LIMITS.textLength],
    ])
    expect(counters.filter((counter) => nearLimit({ counter })).map((counter) => counter.kind)).toEqual([
      'layers',
    ])
  })

  test('an over-limit cloud document opens with the message and can be brought back under', () => {
    const over = documentWith({
      front: Array.from({ length: MAX_LAYERS + 5 }, (_, index) => textLayer(`t${index}`)),
    })

    expect(() => store().loadCanonical({ document: over, cloud: cloud() })).not.toThrow()
    expect(frontLayerCount()).toBe(MAX_LAYERS + 5)
    expect(store().limitNotice).toBe(
      `The front has ${MAX_LAYERS + 5} layers; the limit is ${MAX_LAYERS}. Delete 5 to keep editing and saving.`,
    )

    // Adding or moving is refused while over; removing is allowed.
    store().addText({ content: 'MORE' })
    store().updateLayer({ layerId: 't0', patch: { x: 0.2 } })
    expect(frontLayerCount()).toBe(MAX_LAYERS + 5)
    expect(store().document.layers.find((layer) => layer.id === 't0')).toMatchObject({ x: 0.5 })

    for (let index = 0; index < 4; index += 1) {
      store().removeLayer({ layerId: `t${index}` })
    }

    expect(store().limitNotice).toContain(`has ${MAX_LAYERS + 1} layers`)
    store().removeLayer({ layerId: 't4' })

    expect(store().limitNotice).toBeNull()
    expect(limitOverages({ document: getCanonicalDocument() })).toEqual([])
    expectValid()

    // Removals are ordinary undo steps.
    store().undoLast()
    expect(frontLayerCount()).toBe(MAX_LAYERS + 1)
    expect(store().limitNotice).toContain(`has ${MAX_LAYERS + 1} layers`)
  })

  test('an over-long recovered word can be shortened but not lengthened', () => {
    const long = 'x'.repeat(CANONICAL_LIMITS.textLength + 10)
    let engine = createTeeEngine()
    engine = {
      ...engine,
      stack: replaceDocument({ stack: engine.stack, document: documentWith({ front: [textLayer('w', long)] }) }),
    }

    const longer = runTeeCommand({
      engine,
      command: { type: 'updateLayer', layerId: 'w', patch: { content: `${long}y` } },
    })
    expect(longer.changed).toBe(false)
    expect(longer.refusal).toContain(`has ${CANONICAL_LIMITS.textLength + 10} characters`)

    const shorter = runTeeCommand({
      engine,
      command: { type: 'updateLayer', layerId: 'w', patch: { content: 'fits' } },
    })
    expect(shorter.changed).toBe(true)
    expect(validateCanonicalDocument({ value: shorter.engine.stack.document }).ok).toBe(true)
  })

  test('an over-limit legacy design opens empty with the reason, not a crash', () => {
    const layers = Array.from({ length: MAX_LAYERS + 1 }, (_, index) => ({
      id: `w${index}`,
      kind: 'text' as const,
      panel: 'front' as const,
      content: 'OLD',
      face: 'sans' as const,
      color: '#c4a15a',
      x: 0.5,
      y: 0.5,
      scale: 0.1,
      rotation: 0,
      opacity: 1,
      visible: true,
    }))

    expect(() =>
      store().loadDesign({
        design: {
          ...createEmptyDesign({ id: 'look-over' }),
          garmentId: 'tee',
          document: { garmentId: 'tee', garmentVersion: 2, structural: {}, overrides: [], layers },
        },
      }),
    ).not.toThrow()

    expect(frontLayerCount()).toBe(0)
    expect(store().limitNotice).toContain('over a studio limit on the front')
    expect(store().limitNotice).toContain(`more than ${MAX_LAYERS} items`)
  })
})
