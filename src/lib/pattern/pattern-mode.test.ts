// Measures the procedural tee (@3); must load before the store.
import '../testing/procedural-tee'
import { beforeEach, describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack } from '../canonical-commands'
import { createEmptyCanonicalDocument } from '../canonical-document'
import type { DrapedMesh } from '../cloth/drape-job'
import { getCanonicalDocument, useEditorStore } from '../editor-store'
import { NEUTRAL_SHAPE } from '../garment-shape-params'
import { usePatternDrape, waitForDrape } from '../pattern-drape-status'
import { toRenderDocument } from '../render-projection'
import { resolveTemplate } from '../template-manifest'
import { patternPrintUv, patternSeat } from './pattern-scene'
import { startPattern } from './start-pattern'
import { patternTemplateFor } from './templates'

/** Pattern mode in the editor: commands, projection, print UVs, store. */

const tee = () => createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 4 })
const template = () => patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!

describe('the setPattern command', () => {
  test('a pattern replaces the shape, and null leaves Pattern mode', () => {
    const shaped = { ...tee(), shape: { ...NEUTRAL_SHAPE, bodyLength: 0.2 } }
    const entered = applyCanonicalCommand({ stack: createCanonicalStack({ document: shaped }), command: { type: 'setPattern', pattern: template().pattern } })
    expect(entered.ok && entered.stack.document.pattern?.pieces).toHaveLength(4)
    expect(entered.ok && entered.stack.document.shape).toBeUndefined()

    const left = entered.ok && applyCanonicalCommand({ stack: entered.stack, command: { type: 'setPattern', pattern: null } })
    expect(left && left.ok && left.stack.document.pattern).toBeUndefined()
  })

  test('a malformed pattern is refused', () => {
    const broken = template().pattern
    broken.seams[0]!.a.piece = 'nowhere'
    const result = applyCanonicalCommand({ stack: createCanonicalStack({ document: tee() }), command: { type: 'setPattern', pattern: broken } })
    expect(result.ok).toBe(false)
  })
})

describe('entering Pattern mode', () => {
  test("starts from the template's pattern, folding in the shape", () => {
    expect(startPattern({ document: tee() })).toEqual(template().pattern)

    const longer = startPattern({ document: { ...tee(), shape: { ...NEUTRAL_SHAPE, bodyLength: 0.25 } } })!
    const hem = longer.pieces[0]!.outline!.find((point) => point.id === 'hemL')!
    expect(hem.y).toBe(-110)

    expect(startPattern({ document: createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 3 }) })).toBeNull()
  })
})

describe('rendering a pattern', () => {
  test('the projection carries the pattern and routes canonical panels to render panels', () => {
    const document = { ...tee(), pattern: template().pattern }
    const render = toRenderDocument({ document }).document
    expect(render.pattern?.pattern).toEqual(document.pattern)
    expect(render.pattern?.renderPanels).toEqual({ front: 'front', back: 'back', left: 'right', right: 'left' })
    expect(toRenderDocument({ document: tee() }).document.pattern).toBeUndefined()
  })

  test("a piece point prints in its render panel's atlas rectangle, as seen from outside", () => {
    const document = { ...tee(), pattern: template().pattern }
    const render = toRenderDocument({ document }).document
    const frames = template().frames
    const front = template().pattern.pieces[0]!
    const back = template().pattern.pieces[1]!
    const mesh: Pick<DrapedMesh, 'flat' | 'pieceOf' | 'pieceIds'> = {
      // The front's and back's own origins, then a point 100 mm right of the back's.
      flat: Float32Array.from([0, 0, 0, 0, 100, 0]),
      pieceOf: Uint16Array.from([0, 1, 1]),
      pieceIds: ['front', 'back'],
    }
    const uv = patternPrintUv({ mesh, render: render.pattern!, panelUv: render.panelUv! })
    const rect = render.panelUv!.front
    expect(uv[0]).toBeCloseTo(rect.u0 + (front.panelOrigin[0] / frames.front!.width) * (rect.u1 - rect.u0), 5)
    expect(uv[1]).toBeCloseTo(rect.v0 + (front.panelOrigin[1] / frames.front!.height) * (rect.v1 - rect.v0), 5)

    // Render panels read as seen from outside: right on the piece is right in its rectangle.
    const backRect = render.panelUv!.back
    expect(uv[4]! - uv[2]!).toBeCloseTo((100 / frames.back!.width) * (backRect.u1 - backRect.u0), 5)
    expect(back.panel).toBe('back')
  })

  test("cloth grown past its frame prints at the frame's edge, never in another panel", () => {
    const document = { ...tee(), pattern: template().pattern }
    const render = toRenderDocument({ document }).document
    const mesh: Pick<DrapedMesh, 'flat' | 'pieceOf' | 'pieceIds'> = {
      // Far below the front's frame, and far to its right.
      flat: Float32Array.from([0, -5000, 5000, 0]),
      pieceOf: Uint16Array.from([0, 0]),
      pieceIds: ['front'],
    }
    const uv = patternPrintUv({ mesh, render: render.pattern!, panelUv: render.panelUv! })
    const rect = render.panelUv!.front
    expect(uv[1]).toBeCloseTo(rect.v0, 6)
    expect(uv[2]).toBeCloseTo(rect.u1, 6)
  })

  test("the drape stands where the model stands: its collar at the model's top", () => {
    const seat = patternSeat({ pattern: template().pattern })
    const resolved = resolveTemplate({ id: 'tee-crew-short', version: 4 })
    const bounds = resolved.ok ? resolved.manifest.geometry.bounds! : { min: [0, 0, 0], max: [0, 0, 0] }
    // The tee's collar sits 40 mm above its shoulder, at 1.48 m on the mannequin.
    expect(seat[1]).toBeCloseTo(bounds.max[1] - 1.48, 5)
    expect(seat[0]).toBeCloseTo((bounds.min[0] + bounds.max[0]) / 2, 5)
  })
})

describe('waiting for a drape', () => {
  beforeEach(() => usePatternDrape.setState({ state: 'idle', progress: 0 }))

  test('resolves at once with nothing running, else when it finishes or times out', async () => {
    expect(await waitForDrape()).toBe('idle')

    usePatternDrape.setState({ state: 'draping' })
    const waiting = waitForDrape()
    usePatternDrape.setState({ state: 'ready', progress: 1 })
    expect(await waiting).toBe('ready')

    usePatternDrape.setState({ state: 'draping' })
    expect(await waitForDrape({ timeoutMs: 10 })).toBe('timeout')
  })
})

describe('the store in Pattern mode', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
    useEditorStore.getState().loadCanonical({
      document: { ...tee(), shape: { ...NEUTRAL_SHAPE, necklineDepth: 0.5 } },
      cloud: { designId: 'd', headSeq: 1, title: 'Test', visibility: 'private' } as never,
    })
  })

  test('enter, edit and leave, each one undo step', async () => {
    expect(await useEditorStore.getState().enablePattern()).toBe(true)
    const entered = getCanonicalDocument()
    expect(entered.pattern?.basis).toEqual({ templateId: 'tee-crew-short', templateVersion: 4, patternVersion: 1 })
    expect(entered.shape).toBeUndefined()
    // The neckline slider came along: 0.5 of an 8 cm drop.
    expect(entered.pattern!.pieces[0]!.outline!.find((point) => point.id === 'neckC')!.y).toBe(590 - 40)

    // Entering twice does nothing.
    expect(await useEditorStore.getState().enablePattern()).toBe(false)

    const edited = structuredClone(entered.pattern!)
    edited.pieces[0]!.outline![0]!.y = -20
    edited.pieces[1]!.outline![1]!.y = -20
    expect(useEditorStore.getState().setPattern({ pattern: edited })).toBe(true)

    useEditorStore.getState().undoLast()
    expect(getCanonicalDocument().pattern).toEqual(entered.pattern)

    useEditorStore.getState().disablePattern()
    expect(getCanonicalDocument().pattern).toBeUndefined()
  })
})
