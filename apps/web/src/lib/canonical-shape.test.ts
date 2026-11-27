import { describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack, redoCanonical, undoCanonical } from './canonical-commands'
import {
  type CanonicalDocument,
  createEmptyCanonicalDocument,
  migrateCanonicalDocument,
  readCanonicalDocument,
  shapeOf,
  validateCanonicalDocument,
} from './canonical-document'
import { GOLDEN_DOCUMENT } from './canonical-fixtures'
import { hashCanonicalDocument, normalizeCanonicalDocument, serializeCanonicalDocument } from './canonical-hash'
import { NEUTRAL_SHAPE } from './garment-shape-params'
import { toRenderDocument } from './render-projection'

/** Parametric shape v1 on the canonical document: storage, migration, commands. */

const tee = () => createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 4 })
const SHAPE = { ...NEUTRAL_SHAPE, leftSleeveLength: 0.4, bodyLength: -0.2 }

function issues(value: unknown) {
  const result = validateCanonicalDocument({ value })
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

describe('shape on the document', () => {
  test('a document with no shape is neutral and valid, as every earlier save is', () => {
    expect(issues(tee())).toEqual([])
    expect(shapeOf({ document: tee() })).toEqual(NEUTRAL_SHAPE)
  })

  test('a shaped v4 tee validates', () => {
    expect(issues({ ...tee(), shape: SHAPE })).toEqual([])
  })

  test('refuses out-of-range, missing, unknown and non-finite fields', () => {
    expect(issues({ ...tee(), shape: { ...SHAPE, bodyWidth: 2 } })).toEqual(['$.shape.bodyWidth: out of range [-0.15, 0.25]'])
    expect(issues({ ...tee(), shape: { ...SHAPE, necklineDepth: -0.1 } })).toEqual([
      '$.shape.necklineDepth: out of range [0, 1]',
    ])
    expect(issues({ ...tee(), shape: { ...SHAPE, bodyLength: Number.NaN } })).toEqual([
      '$.shape.bodyLength: expected a finite number',
    ])
    const { bodyWidth: _left, ...partial } = SHAPE
    expect(issues({ ...tee(), shape: partial })).toEqual(['$.shape.bodyWidth: required'])
    expect(issues({ ...tee(), shape: { ...SHAPE, twist: 1 } })).toEqual(['$.shape.twist: unknown field'])
  })

  test('one form per look: a neutral shape is stored as none', () => {
    expect(issues({ ...tee(), shape: NEUTRAL_SHAPE })).toEqual(['$.shape: neutral; leave it out'])
  })

  test('only a template with a shape map takes a shape', () => {
    const older = createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 2 })
    expect(issues({ ...older, shape: SHAPE })).toEqual(['$.shape: this template has no shape'])
  })

  test('an unshaped design hashes exactly as before shapes existed', async () => {
    expect(await hashCanonicalDocument({ document: GOLDEN_DOCUMENT })).toBe(
      'sha256:e081116ffc8971eccb2c8b466f21bf289306bbec33a906e6bd173fc542843b56',
    )
  })
})

describe('migrateCanonicalDocument', () => {
  test('passes a pre-shape document through untouched', () => {
    const before = tee()
    expect(migrateCanonicalDocument({ value: before })).toBe(before)
  })

  test('folds a neutral or null shape to none, and fills a partial one', () => {
    expect(migrateCanonicalDocument({ value: { ...tee(), shape: NEUTRAL_SHAPE } })).toEqual(tee())
    expect(migrateCanonicalDocument({ value: { ...tee(), shape: null } })).toEqual(tee())
    expect(migrateCanonicalDocument({ value: { ...tee(), shape: { bodyLength: 0.1 } } })).toEqual({
      ...tee(),
      shape: { ...NEUTRAL_SHAPE, bodyLength: 0.1 },
    })
  })

  test('leaves what it cannot read for the validator to refuse', () => {
    const odd = { ...tee(), shape: { bodyLength: 0.1, twist: 1 } }
    expect(migrateCanonicalDocument({ value: odd })).toBe(odd)
    expect(readCanonicalDocument({ value: odd }).ok).toBe(false)
  })

  test('round-trips: stored → read → saved → read again gives the same document and hash', async () => {
    for (const stored of [tee(), { ...tee(), shape: NEUTRAL_SHAPE }, { ...tee(), shape: { leftSleeveLength: 0.4, bodyLength: -0.2 } }]) {
      const read = readCanonicalDocument({ value: JSON.parse(JSON.stringify(stored)) })
      expect(read.ok).toBe(true)
      const document = (read as { document: CanonicalDocument }).document
      const saved = serializeCanonicalDocument({ document: normalizeCanonicalDocument({ document }) })
      const again = readCanonicalDocument({ value: JSON.parse(saved) })
      expect(again).toEqual({ ok: true, document: JSON.parse(saved) })
      expect(await hashCanonicalDocument({ document: (again as { document: CanonicalDocument }).document })).toBe(
        await hashCanonicalDocument({ document }),
      )
    }
  })
})

describe('setShape command', () => {
  test('merges fields, keeps the rest, and is one undo step', () => {
    const stack = createCanonicalStack({ document: tee() })
    const first = applyCanonicalCommand({ stack, command: { type: 'setShape', shape: { leftSleeveLength: 0.4 } } })
    expect(first.ok && first.changed).toBe(true)
    const second = applyCanonicalCommand({ stack: first.stack, command: { type: 'setShape', shape: { bodyLength: -0.2 } } })
    expect(second.stack.document.shape).toEqual(SHAPE)
    expect(second.stack.revision).toBe(2)

    const undone = undoCanonical({ stack: second.stack })
    expect(undone.document.shape).toEqual({ ...NEUTRAL_SHAPE, leftSleeveLength: 0.4 })
    expect(redoCanonical({ stack: undone }).document.shape).toEqual(SHAPE)
  })

  test('back to neutral removes the block', () => {
    const shaped = applyCanonicalCommand({ stack: createCanonicalStack({ document: tee() }), command: { type: 'setShape', shape: { bodyWidth: 0.1 } } })
    const reset = applyCanonicalCommand({ stack: shaped.stack, command: { type: 'setShape', shape: { bodyWidth: 0 } } })
    expect(reset.stack.document).toEqual(tee())
    expect('shape' in reset.stack.document).toBe(false)
  })

  test('refuses an out-of-range value instead of clamping it', () => {
    const stack = createCanonicalStack({ document: tee() })
    const result = applyCanonicalCommand({ stack, command: { type: 'setShape', shape: { bodyLength: 3 } } })
    expect(result.ok).toBe(false)
    expect(result.stack).toBe(stack)
  })

  test('refuses a shape on a template without a shape map', () => {
    const stack = createCanonicalStack({ document: createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 2 }) })
    expect(applyCanonicalCommand({ stack, command: { type: 'setShape', shape: { bodyLength: 0.1 } } }).ok).toBe(false)
  })

  test('shaping and then resetting leaves the hash of an untouched design', async () => {
    const untouched = await hashCanonicalDocument({ document: tee() })
    const shaped = applyCanonicalCommand({ stack: createCanonicalStack({ document: tee() }), command: { type: 'setShape', shape: { leftSleeveLength: 0.4, necklineDepth: 0.5 } } })
    expect(await hashCanonicalDocument({ document: shaped.stack.document })).not.toBe(untouched)
    const reset = applyCanonicalCommand({
      stack: shaped.stack,
      command: { type: 'setShape', shape: { leftSleeveLength: 0, necklineDepth: 0 } },
    })
    expect(await hashCanonicalDocument({ document: reset.stack.document })).toBe(untouched)
  })

  test('the same shape again changes nothing', () => {
    const shaped = applyCanonicalCommand({ stack: createCanonicalStack({ document: tee() }), command: { type: 'setShape', shape: { bodyWidth: 0.1 } } })
    const again = applyCanonicalCommand({ stack: shaped.stack, command: { type: 'setShape', shape: { bodyWidth: 0.1 } } })
    expect(again.ok && again.changed).toBe(false)
  })
})

describe('render projection', () => {
  test('carries the shape to the 3D renderer, and nothing when neutral', () => {
    expect(toRenderDocument({ document: { ...tee(), shape: SHAPE } }).document.shape).toEqual(SHAPE)
    expect('shape' in toRenderDocument({ document: tee() }).document).toBe(false)
  })
})
