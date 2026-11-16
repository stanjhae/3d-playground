import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument, validateCanonicalDocument } from '../canonical-document'
import { serializeCanonicalValue, sha256Hex } from '../canonical-hash'
import { bodyColliders } from '../cloth/colliders'
import { simulateCloth } from '../cloth/solver'
import { TEMPLATE_IDS, currentTemplateFor } from '../template-manifest'
import { clothFromPattern } from './build-cloth'
import { hashPattern } from './pattern-hash'
import { PATTERN_TEMPLATE_KEYS, patternTemplateFor, templateHasPattern } from './templates'
import { validateGeometry } from './validate-geometry'

/**
 * Every garment's pattern template. A shipped pattern version never changes
 * (saved designs and stored meshes depend on it), so each is pinned here by
 * the hash of its pattern and of its frames. If a family change moves one,
 * add a new `patternVersion` for that garment and keep the old one.
 */
const PINNED: Record<string, [string, string]> = {
  'tee-crew-short@4': ['sha256:aa71694dfba4361d5197c0bfa8e083611f42b601aec501ec23cbaddd5aad791a', 'a73e50a157945d49'],
  'hoodie@1': ['sha256:1f8de4e04d3425414556de1267298f837cb79720645e1f078f772f70f3e51a2a', '5fac893bb7f38b00'],
  'coat@1': ['sha256:26fd930d043100a2fd8930718cbdd7cdeea5444bbbe22b839a948b945115c5fb', '474342b408af5cd3'],
  'suit@1': ['sha256:ac4972c87e8e61d3e275ef500eb422cbeb9b0555e16a8da15cc4bc999102bc98', 'd663ffcb98f91ac0'],
  'tailored@1': ['sha256:eb9d9ffa9224cfa654c434689e8668ae54a97cd103761be28ea3a0efb2fc957f', 'a12384d62bd77ea8'],
  'mixed@1': ['sha256:b7be4ce41ffc33be6684ab113287cce0e81847902c1cb5b41110160ae7dd918e', 'b8671d60eaa69cce'],
  'slip@1': ['sha256:eafa8f08a3b684c326d91a9b4268df746f197a7fc82b06641d8dc5a60ce620cf', 'f2828f5e9d2af8e9'],
  'overall@1': ['sha256:3a2922d61bc81046673e0490d94cc5aeb437824506361a6a367f56ae506b0cae', '5171854b06d8a24f'],
  'gown@1': ['sha256:c1616f08ae49c9a1fb9399386b20ade13941560a68f08ffc26dae8cde10e975b', 'd3d3fe42b355adb1'],
}

function load(key: string) {
  const [templateId, version] = key.split('@') as [string, string]
  return { templateId, templateVersion: Number(version), template: patternTemplateFor({ templateId, templateVersion: Number(version) })! }
}

describe('pattern templates', () => {
  test("every garment's current template has one, and only listed versions do", () => {
    const current = TEMPLATE_IDS.map((id) => {
      const manifest = currentTemplateFor({ templateId: id })
      return `${manifest.id}@${manifest.version}`
    })
    expect([...PATTERN_TEMPLATE_KEYS].sort()).toEqual(current.sort())
    expect(templateHasPattern({ templateId: 'tee-crew-short', templateVersion: 3 })).toBe(false)
    expect(patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 3 })).toBeNull()
  })

  test.each(PATTERN_TEMPLATE_KEYS)('%s is pinned and unchanged', async (key) => {
    const { template } = load(key)
    const [patternHash, framesHash] = PINNED[key]!
    expect(await hashPattern({ pattern: template.pattern })).toBe(patternHash)
    expect((await sha256Hex({ text: serializeCanonicalValue({ value: template.frames }) })).slice(0, 16)).toBe(framesHash)
  })

  test.each(PATTERN_TEMPLATE_KEYS)('%s is a valid document pattern that can be sewn, inside its frames', (key) => {
    const { templateId, template } = load(key)
    const document = { ...createEmptyCanonicalDocument({ templateId: templateId as never }), pattern: template.pattern }
    const result = validateCanonicalDocument({ value: document })
    expect(result.ok ? [] : result.issues).toEqual([])
    expect(validateGeometry({ pattern: template.pattern, frames: template.frames })).toEqual([])

    // Frames keep the print panel's proportions.
    const manifest = currentTemplateFor({ templateId })

    for (const [panel, frame] of Object.entries(template.frames)) {
      const aspect = manifest.regions[panel]?.surface?.panelAspect

      if (aspect) {
        expect(frame.width / frame.height).toBeCloseTo(aspect, 2)
      }
    }
  })

  test.each(PATTERN_TEMPLATE_KEYS)('%s drapes, settles and hangs on the body', (key) => {
    const { template } = load(key)
    const built = clothFromPattern({ pattern: template.pattern, colliders: bodyColliders() })
    const result = simulateCloth(built.input, { maxSeconds: 10 })
    expect(result.settled).toBe(true)
    expect(result.seconds).toBeLessThan(6)
    expect(built.input.positions.length / 3).toBeLessThan(3000)

    // Every piece stays up: nothing piled on the floor.
    const top = new Map<number, number>()

    for (let i = 0; i < built.pieceOf.length; i += 1) {
      top.set(built.pieceOf[i]!, Math.max(top.get(built.pieceOf[i]!) ?? -Infinity, result.positions[i * 3 + 1]!))
    }

    for (const [piece, y] of top) {
      expect(y, built.pieceIds[piece]).toBeGreaterThan(0.85)
    }
  }, 30_000)

  test('a template comes back as a fresh copy each time', () => {
    const first = patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!
    first.pattern.pieces[0]!.outline![0]!.x = 1
    expect(patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!.pattern.pieces[0]!.outline![0]!.x).not.toBe(1)
  })
})
