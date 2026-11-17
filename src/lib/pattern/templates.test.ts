import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument, validateCanonicalDocument } from '../canonical-document'
import { serializeCanonicalValue, sha256Hex } from '../canonical-hash'
import { bodyColliders } from '../cloth/colliders'
import { simulateCloth } from '../cloth/solver'
import { TEMPLATE_IDS, currentTemplateFor, resolveTemplate } from '../template-manifest'
import { clothFromPattern } from './build-cloth'
import { hashPattern } from './pattern-hash'
import { PATTERN_TEMPLATE_VERSIONS } from '../pattern-beta'
import { PATTERN_TEMPLATE_KEYS, patternPresetFor, patternPresetsFor, patternTemplateFor, templateHasPattern } from './templates'
import { validateGeometry } from './validate-geometry'

/**
 * Every garment's pattern template. A shipped pattern version never changes
 * (saved designs and stored meshes depend on it), so each is pinned here by
 * the hash of its pattern and of its frames. If a family change moves one,
 * add a new `patternVersion` for that garment and keep the old one.
 */
const PINNED: Record<string, [string, string]> = {
  'tee-crew-short@4': ['sha256:aa71694dfba4361d5197c0bfa8e083611f42b601aec501ec23cbaddd5aad791a', 'a73e50a157945d49'],
  'tee-crew-short@5': ['sha256:34bed812b0021336b151985a2233976555a91d7be7b94918d724dfa2b21e8545', '7b1afaeb9fa8bf76'],
  'tee-crew-short@6': ['sha256:5ded54d2033e3b91c8c785e05205c938164383376030a86b0521545759ad1a40', 'c8e2b17b7396b754'],
  'hoodie@1': ['sha256:1f8de4e04d3425414556de1267298f837cb79720645e1f078f772f70f3e51a2a', '5fac893bb7f38b00'],
  'coat@1': ['sha256:26fd930d043100a2fd8930718cbdd7cdeea5444bbbe22b839a948b945115c5fb', '474342b408af5cd3'],
  'suit@1': ['sha256:ac4972c87e8e61d3e275ef500eb422cbeb9b0555e16a8da15cc4bc999102bc98', 'd663ffcb98f91ac0'],
  'tailored@1': ['sha256:eb9d9ffa9224cfa654c434689e8668ae54a97cd103761be28ea3a0efb2fc957f', 'a12384d62bd77ea8'],
  'mixed@1': ['sha256:b7be4ce41ffc33be6684ab113287cce0e81847902c1cb5b41110160ae7dd918e', 'b8671d60eaa69cce'],
  'slip@1': ['sha256:eafa8f08a3b684c326d91a9b4268df746f197a7fc82b06641d8dc5a60ce620cf', 'f2828f5e9d2af8e9'],
  'overall@1': ['sha256:3a2922d61bc81046673e0490d94cc5aeb437824506361a6a367f56ae506b0cae', '5171854b06d8a24f'],
  'gown@1': ['sha256:c1616f08ae49c9a1fb9399386b20ade13941560a68f08ffc26dae8cde10e975b', 'd3d3fe42b355adb1'],
  'vest@1': ['sha256:37b08e7b500950f2d1ab4d8a63bc7dbb3aebcb47425e37dacd4175db931543ed', '100358093c658ef2'],
  'crop@1': ['sha256:1dec861639757e7933b6d873b3e266dd402168a2311b68b1e984c4a28c681c72', '4f5e730c91a51c6d'],
  'dress@1': ['sha256:80494d45d7e99f4bd81567e179df075ea23cd63233c71c743117a3a0b5678a13', '65b655ce94b3b01a'],
  'trousers@1': ['sha256:99a74606456912d1a2db48379b61c9aec94618f868a5c94a6e714cbc1ee5352e', '2231faa5dc56e885'],
}

/** Presets (another starting pattern on the same template), pinned the same way. */
const PINNED_PRESETS: Record<string, [string, string]> = {
  'trousers@1#shorts': ['sha256:6c515e7ca6cccb0af7a566c7a4c73b61235c205c9e97513342f1b8c826154d9b', '2231faa5dc56e885'],
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
    // Every current version, plus older ones designs already started on.
    expect(current.filter((key) => !PATTERN_TEMPLATE_KEYS.includes(key))).toEqual([])
    expect(PATTERN_TEMPLATE_KEYS.filter((key) => !current.includes(key))).toEqual(['tee-crew-short@4', 'tee-crew-short@5'])
    // The switch's light list says the same.
    expect([...PATTERN_TEMPLATE_VERSIONS].sort()).toEqual([...PATTERN_TEMPLATE_KEYS].sort())
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
    const { templateId, templateVersion, template } = load(key)
    const document = { ...createEmptyCanonicalDocument({ templateId: templateId as never, version: templateVersion }), pattern: template.pattern }
    const result = validateCanonicalDocument({ value: document })
    expect(result.ok ? [] : result.issues).toEqual([])
    expect(validateGeometry({ pattern: template.pattern, frames: template.frames })).toEqual([])

    // Frames keep the print panel's proportions.
    const resolved = resolveTemplate({ id: templateId, version: Number(key.split('@')[1]) })
    const manifest = resolved.ok ? resolved.manifest : currentTemplateFor({ templateId })

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

  /** Where each piece's outline lies on the body after the drape, in metres. */
  function drapeOf(pattern: Parameters<typeof clothFromPattern>[0]['pattern']) {
    const built = clothFromPattern({ pattern, colliders: bodyColliders() })
    const result = simulateCloth(built.input, { maxSeconds: 10 })
    const extent = new Map<string, { minY: number; maxY: number }>()

    for (let i = 0; i < built.pieceOf.length; i += 1) {
      const id = built.pieceIds[built.pieceOf[i]!]!
      const y = result.positions[i * 3 + 1]!
      const at = extent.get(id) ?? { minY: Infinity, maxY: -Infinity }
      extent.set(id, { minY: Math.min(at.minY, y), maxY: Math.max(at.maxY, y) })
    }

    let moving = 0

    for (let i = 0; i < result.positions.length; i += 1) {
      moving = Math.max(moving, Math.abs(result.positions[i]!))
    }

    return { result, extent, reach: moving }
  }

  // Roadmap D1: each new garment hangs where it is cut to.
  test('the D1 garments settle where they are cut to: no piece sliding off, nothing flung away', () => {
    const waist = 1.0
    const checks: Record<string, (extent: Map<string, { minY: number; maxY: number }>) => void> = {
      // Sleeveless, hanging from the shoulders to the hip.
      'vest@1': (extent) => {
        expect(extent.get('front')!.maxY).toBeGreaterThan(1.4)
        expect(extent.get('front')!.minY).toBeLessThan(0.9)
      },
      // The hem about 80 mm above the waist.
      'crop@1': (extent) => {
        for (const id of ['front', 'back']) {
          expect(extent.get(id)!.minY - waist, id).toBeGreaterThan(0.05)
          expect(extent.get(id)!.minY - waist, id).toBeLessThan(0.11)
        }
      },
      // The bodice and skirt meet at the waist; the skirt falls below the knee.
      'dress@1': (extent) => {
        expect(Math.abs(extent.get('front')!.minY - extent.get('skirtFront')!.maxY)).toBeLessThan(0.02)
        expect(Math.abs(extent.get('skirtFront')!.maxY - waist)).toBeLessThan(0.03)
        expect(extent.get('skirtFront')!.minY).toBeLessThan(0.45)
      },
      // At the waist, down to the ankle.
      'trousers@1': (extent) => {
        expect(Math.abs(extent.get('trouserFront')!.maxY - waist)).toBeLessThan(0.04)
        expect(extent.get('trouserFront')!.minY).toBeLessThan(0.1)
      },
    }

    for (const [key, check] of Object.entries(checks)) {
      const { result, extent, reach } = drapeOf(load(key).template.pattern)
      expect(result.settled, key).toBe(true)
      expect(Number.isFinite(reach) && reach < 2, key).toBe(true)
      check(extent)
    }
  }, 60_000)

  test('trousers offer shorts: the same pieces, seams and frames, cut above the knee and hung at the same waist', async () => {
    expect(patternPresetsFor({ templateId: 'trousers', templateVersion: 1 })).toEqual([{ id: 'shorts', label: 'Shorts' }])
    expect(patternPresetsFor({ templateId: 'tee-crew-short', templateVersion: 5 })).toEqual([])
    expect(patternPresetFor({ templateId: 'trousers', templateVersion: 1, preset: 'capri' })).toBeNull()
    expect(patternPresetFor({ templateId: 'vest', templateVersion: 1, preset: 'shorts' })).toBeNull()

    const full = load('trousers@1').template
    const shorts = patternPresetFor({ templateId: 'trousers', templateVersion: 1, preset: 'shorts' })!
    const [patternHash, framesHash] = PINNED_PRESETS['trousers@1#shorts']!
    expect(await hashPattern({ pattern: shorts.pattern })).toBe(patternHash)
    expect((await sha256Hex({ text: serializeCanonicalValue({ value: shorts.frames }) })).slice(0, 16)).toBe(framesHash)

    expect(shorts.frames).toEqual(full.frames)
    expect(shorts.pattern.basis).toEqual(full.pattern.basis)
    expect(shorts.pattern.pieces.map((piece) => piece.id)).toEqual(full.pattern.pieces.map((piece) => piece.id))
    expect(shorts.pattern.seams).toEqual(full.pattern.seams)
    const document = { ...createEmptyCanonicalDocument({ templateId: 'trousers' as never, version: 1 }), pattern: shorts.pattern }
    const valid = validateCanonicalDocument({ value: document })
    expect(valid.ok ? [] : valid.issues).toEqual([])
    expect(validateGeometry({ pattern: shorts.pattern, frames: shorts.frames })).toEqual([])

    const { result, extent } = drapeOf(shorts.pattern)
    const long = drapeOf(full.pattern)
    expect(result.settled).toBe(true)
    expect(Math.abs(extent.get('trouserFront')!.maxY - long.extent.get('trouserFront')!.maxY)).toBeLessThan(0.01)
    expect(extent.get('trouserFront')!.minY).toBeGreaterThan(0.45)
    expect(extent.get('trouserFront')!.minY).toBeLessThan(0.6)
  }, 60_000)

  test('a template comes back as a fresh copy each time', () => {
    const first = patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!
    first.pattern.pieces[0]!.outline![0]!.x = 1
    expect(patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!.pattern.pieces[0]!.outline![0]!.x).not.toBe(1)
  })
})
