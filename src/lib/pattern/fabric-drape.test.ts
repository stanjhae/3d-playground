// Measures the procedural tee (@3); must load before the store.
import '../testing/procedural-tee'
import { beforeEach, describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from '../canonical-document'
import { getCanonicalDocument, useEditorStore } from '../editor-store'
import { listFabrics } from '../fabrics'
import { FABRICS } from './build-cloth'
import { drapeFabricFor, keepsOwnFabric, withDrapeFabric } from './fabric-drape'
import { PATTERN_FABRICS } from './pattern-document'
import { hashPattern } from './pattern-hash'
import { patternTemplateFor } from './templates'

/** Fabric drives the drape (B3): render fabric to pattern fabric, and the store. */

const hoodie = () => patternTemplateFor({ templateId: 'hoodie', templateVersion: 1 })!.pattern

describe('a render fabric to a pattern fabric', () => {
  test.each([
    ['cotton', 'jersey'],
    ['jersey', 'jersey'],
    ['denim', 'denim'],
    ['silk', 'satin'],
    ['satin', 'satin'],
    ['wool', 'wool'],
    ['linen', 'linen'],
    ['chiffon', 'chiffon'],
    ['canvas', 'canvas'],
    ['leather', 'firm'],
  ] as const)('%s drapes as %s', (fabricId, fabric) => {
    expect(drapeFabricFor({ fabricId })).toBe(fabric)
  })

  test('colourways drape as their cloth, by texture', () => {
    expect(drapeFabricFor({ fabricId: 'blush-silk' })).toBe('satin')
    expect(drapeFabricFor({ fabricId: 'rose-chiffon' })).toBe('chiffon')
    expect(drapeFabricFor({ fabricId: 'oxblood-leather' })).toBe('firm')
    expect(drapeFabricFor({ mapId: 'canvas-duck' })).toBe('canvas')
    expect(drapeFabricFor({ fabricId: 'ink-cotton', mapId: 'cotton-weave' })).toBe('jersey')
  })

  test('every preset maps to a fabric; an unknown one leaves the drape alone', () => {
    for (const preset of listFabrics()) {
      expect(PATTERN_FABRICS).toContain(drapeFabricFor({ fabricId: preset.id, mapId: preset.mapId }))
    }

    expect(drapeFabricFor({ fabricId: 'nowhere' })).toBeNull()
    expect(drapeFabricFor({ mapId: 'nowhere' })).toBeNull()
    expect(drapeFabricFor({})).toBeNull()
  })
})

describe('the simulation fabrics', () => {
  test('stay inside the solver constraints', () => {
    for (const fabric of PATTERN_FABRICS) {
      const { stretch, bend, massScale } = FABRICS[fabric]
      expect(stretch).toBeGreaterThanOrEqual(1e-7)
      expect(bend).toBeGreaterThanOrEqual(stretch * 10)
      expect(massScale ?? 1).toBeGreaterThan(0)
    }
  })

  test('chiffon is the lightest and softest, canvas the stiffest', () => {
    const effectiveBend = (fabric: keyof typeof FABRICS) => FABRICS[fabric].bend * (FABRICS[fabric].massScale ?? 1)
    const others = PATTERN_FABRICS.filter((fabric) => fabric !== 'chiffon' && fabric !== 'canvas')

    for (const fabric of others) {
      expect(effectiveBend('chiffon')).toBeGreaterThan(effectiveBend(fabric))
      expect(effectiveBend('canvas')).toBeLessThan(effectiveBend(fabric))
      expect(FABRICS.chiffon.massScale!).toBeLessThan(FABRICS[fabric].massScale ?? 1)
    }
  })
})

describe('cutting a pattern from a fabric', () => {
  test('every piece but the hood takes it', () => {
    const pattern = hoodie()
    const chiffon = withDrapeFabric({ pattern, fabric: 'chiffon' })

    for (const piece of chiffon.pieces) {
      expect(piece.fabric).toBe(piece.id.startsWith('hood') ? 'fleece' : 'chiffon')
    }

    expect(pattern.pieces.find((piece) => piece.id === 'front')!.fabric).toBe('fleece')
  })

  test('trims and bands keep their own, and a mirror follows its source', () => {
    const pattern = hoodie()
    const front = pattern.pieces.find((piece) => piece.id === 'front')!
    pattern.pieces.push({ ...front, id: 'waistband', panel: 'front' }, { ...front, id: 'trimA', panel: 'collar' })

    expect(keepsOwnFabric({ piece: pattern.pieces.find((piece) => piece.id === 'hoodR')!, pattern })).toBe(true)
    expect(keepsOwnFabric({ piece: pattern.pieces.find((piece) => piece.id === 'sleeveL')!, pattern })).toBe(false)

    const cut = withDrapeFabric({ pattern, fabric: 'canvas' })
    expect(cut.pieces.find((piece) => piece.id === 'waistband')!.fabric).toBe('fleece')
    expect(cut.pieces.find((piece) => piece.id === 'trimA')!.fabric).toBe('fleece')
  })

  test('the same fabric changes nothing; another changes the hash, so the drape re-runs', async () => {
    const pattern = patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 5 })!.pattern
    expect(withDrapeFabric({ pattern, fabric: 'jersey' })).toBe(pattern)
    expect(await hashPattern({ pattern: withDrapeFabric({ pattern, fabric: 'linen' }) })).not.toBe(await hashPattern({ pattern }))
  })
})

describe('picking a fabric in the store', () => {
  const load = (templateId: string, version: number) => {
    useEditorStore.getState().reset()
    useEditorStore.getState().loadCanonical({
      document: createEmptyCanonicalDocument({ templateId, version }),
      cloud: { designId: 'd', headSeq: 1, title: 'Test', visibility: 'private' } as never,
    })
  }

  beforeEach(() => load('hoodie', 1))

  test('in Pattern mode it sets every piece but the hood, as one undo step with the colour', async () => {
    expect(await useEditorStore.getState().enablePattern()).toBe(true)
    const before = getCanonicalDocument()
    const undoCount = useEditorStore.getState().undoCount

    useEditorStore.getState().applyFabric({ fabricId: 'chiffon', colorId: 'chiffon' })
    const after = getCanonicalDocument()

    expect(after.base).not.toEqual(before.base)
    expect(after.pattern!.pieces.map((piece) => [piece.id, piece.fabric])).toEqual(
      before.pattern!.pieces.map((piece) => [piece.id, piece.id.startsWith('hood') ? 'fleece' : 'chiffon']),
    )
    expect(useEditorStore.getState().undoCount).toBe(undoCount + 1)

    useEditorStore.getState().undoLast()
    expect(getCanonicalDocument().base).toEqual(before.base)
    expect(getCanonicalDocument().pattern).toEqual(before.pattern)
  })

  test('outside Pattern mode only the colour changes', () => {
    const before = getCanonicalDocument()
    useEditorStore.getState().applyFabric({ fabricId: 'canvas', colorId: 'canvas' })
    const after = getCanonicalDocument()

    expect(after.pattern).toBeUndefined()
    expect({ ...after, base: before.base }).toEqual(before)
  })
})
