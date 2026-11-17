import { resolveTemplate } from '../template-manifest.ts'
import { type BodiceSpec, type PatternFrame, type TrouserSpec, bodice, hood, layoutFrames, skirt, sleeves, trousers } from './families.ts'
import type { CanonicalPattern, PatternFabric, PatternPiece, PatternSeam } from './pattern-document.ts'

/**
 * Pattern templates: each garment template version's starting pattern
 * and its panels' print frames. A design in Pattern mode records the one
 * it started from in `pattern.basis`.
 *
 * Built from the families on demand. A shipped `patternVersion` must never
 * change its output (designs and stored meshes depend on it), so
 * `templates.test.ts` pins every one by hash. A change means a new
 * `patternVersion`, with the old one kept.
 */
export type PatternTemplate = {
  pattern: CanonicalPattern
  frames: Record<string, PatternFrame>
}

type Built = { pieces: PatternPiece[]; seams: PatternSeam[] }

type Recipe = {
  patternVersion: number
  build: () => Built
  /**
   * Other starting patterns on the same template (a length, say), laid in
   * the template's own frames. The pieces and seams keep the template's
   * ids, so a preset is only a different pattern a design may start from.
   */
  presets?: Record<string, { label: string; build: () => Built }>
}

const SHIRT_NECK = { neck: 'round', armholeIn: 18 } as const

function upper({ spec, sleeve, fabric, lift }: { spec: BodiceSpec; sleeve?: { length: number; cuffHalf: number; capHeight: number }; fabric?: PatternFabric; lift?: number }) {
  const body = bodice({ spec, fabric, lift })
  const [front, back] = body.pieces as [PatternPiece, PatternPiece]
  const arms = sleeve ? sleeves({ spec: sleeve, front, back, fabric }) : { pieces: [], seams: [] }
  return { front, back, pieces: [...body.pieces, ...arms.pieces], seams: [...body.seams, ...arms.seams] }
}

const teeRecipe: Recipe = {
  patternVersion: 1,
  build: () =>
    upper({
      spec: { hemHalf: 255, armpitHalf: 255, armpitY: 440, shoulderHalf: 175, shoulderY: 640, neckHalf: 78, neckY: 680, frontNeckDip: 90, backNeckDip: 25, ...SHIRT_NECK },
      sleeve: { length: 245, cuffHalf: 175, capHeight: 65 },
      fabric: 'jersey',
    }),
}

const TROUSER_SPEC: TrouserSpec = { length: 900, waistHalf: 165, hipHalf: 220, hipY: 810, crotchY: 660, cuffOuter: 205, cuffInner: 15, waistAt: 0.99 }
/** The trousers cut above the knee: the same waist, hip and seams. */
const SHORTS_SPEC: TrouserSpec = { ...TROUSER_SPEC, length: 420, hipY: 330, crotchY: 180, cuffOuter: 245, cuffInner: 20 }

/** A bodice ending at the waist, sewn there to a flared skirt. */
function waistedDress(): Built {
  const waistHalf = 175
  const top = upper({
    spec: { hemHalf: waistHalf, armpitHalf: 230, armpitY: 280, shoulderHalf: 150, shoulderY: 480, neckHalf: 80, neckY: 520, frontNeckDip: 110, backNeckDip: 30, ...SHIRT_NECK, armholeIn: 15 },
    fabric: 'woven',
  })
  const lower = skirt({ spec: { length: 600, waistHalf, hipHalf: 260, hipY: 520, hemHalf: 440, waistAt: 0.99 }, fabric: 'satin' })

  // The bodice's hem is the waist seam: hem edits (lengthen, flare, curve) and widening act on the skirt.
  for (const piece of [top.front, top.back]) {
    const { hem, side, ...roles } = piece.roles ?? {}
    piece.roles = { ...roles, waist: hem ?? [] }
    void side
  }

  return {
    pieces: [...top.pieces, ...lower.pieces],
    seams: [
      ...top.seams,
      ...lower.seams,
      { id: 'waistFront', kind: 'sew', a: { piece: top.front.id, from: 'hemL', to: 'hemR' }, b: { piece: 'skirtFront', from: 'waistR', to: 'waistL' } },
      { id: 'waistBack', kind: 'sew', a: { piece: top.back.id, from: 'hemL', to: 'hemR' }, b: { piece: 'skirtBack', from: 'waistR', to: 'waistL' } },
    ],
  }
}

const RECIPES: Record<string, Recipe> = {
  'tee-crew-short@4': teeRecipe,
  // The same tee, its sleeve panels wrapped all round: wider sleeve frames.
  'tee-crew-short@5': teeRecipe,

  'hoodie@1': {
    patternVersion: 1,
    build: () => {
      const top = upper({
        spec: { hemHalf: 270, armpitHalf: 275, armpitY: 400, shoulderHalf: 190, shoulderY: 600, neckHalf: 100, neckY: 640, frontNeckDip: 90, backNeckDip: 30, ...SHIRT_NECK, armholeIn: 20 },
        sleeve: { length: 600, cuffHalf: 120, capHeight: 80 },
        fabric: 'fleece',
      })
      const head = hood({ front: top.front, back: top.back, height: 360 })
      return { pieces: [...top.pieces, ...head.pieces], seams: [...top.seams, ...head.seams] }
    },
  },

  'coat@1': {
    patternVersion: 1,
    build: () =>
      upper({
        spec: { hemHalf: 330, armpitHalf: 300, armpitY: 480, shoulderHalf: 200, shoulderY: 700, neckHalf: 90, neckY: 740, frontNeckDip: 260, backNeckDip: 30, neck: 'v', backNeck: 'round', armholeIn: 22 },
        sleeve: { length: 620, cuffHalf: 140, capHeight: 90 },
        fabric: 'firm',
      }),
  },

  'suit@1': {
    patternVersion: 1,
    build: () => {
      const jacket = upper({
        spec: { hemHalf: 290, armpitHalf: 285, armpitY: 430, shoulderHalf: 195, shoulderY: 640, neckHalf: 85, neckY: 680, frontNeckDip: 300, backNeckDip: 25, neck: 'v', backNeck: 'round', armholeIn: 20 },
        sleeve: { length: 600, cuffHalf: 125, capHeight: 90 },
        fabric: 'woven',
      })
      const legs = trousers({
        spec: { length: 840, waistHalf: 155, hipHalf: 215, hipY: 690, crotchY: 560, cuffOuter: 225, cuffInner: 12, waistAt: 0.94 },
        fabric: 'woven',
      })
      return { pieces: [...jacket.pieces, ...legs.pieces], seams: [...jacket.seams, ...legs.seams] }
    },
  },

  'tailored@1': {
    patternVersion: 1,
    build: () =>
      upper({
        spec: {
          hemHalf: 380,
          waist: { half: 250, y: 920 },
          armpitHalf: 280,
          armpitY: 1130,
          shoulderHalf: 195,
          shoulderY: 1340,
          neckHalf: 88,
          neckY: 1380,
          frontNeckDip: 380,
          backNeckDip: 25,
          neck: 'v',
          backNeck: 'round',
          armholeIn: 20,
        },
        sleeve: { length: 620, cuffHalf: 130, capHeight: 90 },
        fabric: 'woven',
      }),
  },

  'mixed@1': {
    patternVersion: 1,
    build: () => {
      const shirt = upper({
        spec: { hemHalf: 255, armpitHalf: 250, armpitY: 420, shoulderHalf: 180, shoulderY: 620, neckHalf: 75, neckY: 660, frontNeckDip: 80, backNeckDip: 25, ...SHIRT_NECK },
        sleeve: { length: 580, cuffHalf: 110, capHeight: 80 },
        fabric: 'woven',
      })
      const lower = skirt({ spec: { length: 800, waistHalf: 150, hipHalf: 255, hipY: 640, hemHalf: 400, waistAt: 0.92 }, fabric: 'satin' })
      return { pieces: [...shirt.pieces, ...lower.pieces], seams: [...shirt.seams, ...lower.seams] }
    },
  },

  'slip@1': {
    patternVersion: 1,
    build: () =>
      upper({
        spec: {
          hemHalf: 330,
          waist: { half: 180, y: 760 },
          armpitHalf: 210,
          armpitY: 990,
          shoulderHalf: 95,
          shoulderY: 1210,
          neckHalf: 70,
          neckY: 1220,
          frontNeckDip: 220,
          backNeckDip: 200,
          neck: 'v',
          backNeck: 'v',
          armholeIn: 10,
        },
        fabric: 'satin',
      }),
  },

  'overall@1': {
    patternVersion: 1,
    build: () =>
      upper({
        spec: {
          hemHalf: 330,
          waist: { half: 210, y: 430 },
          armpitHalf: 230,
          armpitY: 560,
          shoulderHalf: 140,
          shoulderY: 860,
          neckHalf: 100,
          neckY: 880,
          frontNeckDip: 220,
          backNeckDip: 220,
          neck: 'square',
          armholeIn: 10,
        },
        fabric: 'denim',
      }),
  },

  'gown@1': {
    patternVersion: 1,
    build: () =>
      upper({
        spec: {
          hemHalf: 650,
          waist: { half: 170, y: 920 },
          armpitHalf: 230,
          armpitY: 1160,
          shoulderHalf: 150,
          shoulderY: 1380,
          neckHalf: 85,
          neckY: 1420,
          frontNeckDip: 120,
          backNeckDip: 30,
          neck: 'round',
          armholeIn: 15,
        },
        fabric: 'satin',
      }),
  },

  // Roadmap D1: garments whose GLBs are baked from these recipes
  // (scripts/bake-pattern-glb.mjs), with no downloaded model.

  // Sleeveless, cut deep under the arm, with a V front.
  'vest@1': {
    patternVersion: 1,
    build: () =>
      upper({
        spec: { hemHalf: 265, armpitHalf: 245, armpitY: 330, shoulderHalf: 150, shoulderY: 600, neckHalf: 85, neckY: 640, frontNeckDip: 270, backNeckDip: 25, neck: 'v', backNeck: 'round', armholeIn: 30 },
        fabric: 'woven',
      }),
  },

  // Short sleeves, the hem about 80 mm above the waist.
  'crop@1': {
    patternVersion: 1,
    build: () =>
      upper({
        spec: { hemHalf: 245, armpitHalf: 250, armpitY: 195, shoulderHalf: 170, shoulderY: 395, neckHalf: 78, neckY: 435, frontNeckDip: 85, backNeckDip: 25, ...SHIRT_NECK },
        sleeve: { length: 200, cuffHalf: 170, capHeight: 60 },
        fabric: 'jersey',
      }),
  },

  // A bodice to the waist, sewn to a flared skirt.
  'dress@1': {
    patternVersion: 1,
    build: () => waistedDress(),
  },

  // Full length; shorts are a length preset (`PATTERN_PRESETS`).
  'trousers@1': {
    patternVersion: 1,
    build: () => trousers({ spec: TROUSER_SPEC, fabric: 'woven' }),
    presets: {
      shorts: { label: 'Shorts', build: () => trousers({ spec: SHORTS_SPEC, fabric: 'woven' }) },
    },
  },
}

const cache = new Map<string, PatternTemplate>()

/** The pattern template for a garment template version, if it has one. */
export function patternTemplateFor({ templateId, templateVersion }: { templateId: string; templateVersion: number }): PatternTemplate | null {
  const key = `${templateId}@${templateVersion}`
  const recipe = RECIPES[key]

  if (!recipe) {
    return null
  }

  const hit = cache.get(key)

  if (hit) {
    return structuredClone(hit)
  }

  const resolved = resolveTemplate({ id: templateId, version: templateVersion })
  const { pieces, seams } = recipe.build()
  const aspects: Record<string, number> = {}

  if (resolved.ok) {
    for (const [panel, region] of Object.entries(resolved.manifest.regions)) {
      if (region.surface?.panelAspect) {
        aspects[panel] = region.surface.panelAspect
      }
    }
  }

  const frames = layoutFrames({ pieces, aspects })
  const template: PatternTemplate = {
    pattern: { v: 1, basis: { templateId, templateVersion, patternVersion: recipe.patternVersion }, pieces, seams },
    frames,
  }
  cache.set(key, template)
  return structuredClone(template)
}

export function templateHasPattern({ templateId, templateVersion }: { templateId: string; templateVersion: number }) {
  return `${templateId}@${templateVersion}` in RECIPES
}

/** Every garment template version that has a pattern, as `id@version`. */
export const PATTERN_TEMPLATE_KEYS = Object.freeze(Object.keys(RECIPES))

export type PatternPreset = { id: string; label: string }

/**
 * The other starting patterns a template version offers (the trousers'
 * shorts), by id and label. Empty for most templates.
 */
export function patternPresetsFor({ templateId, templateVersion }: { templateId: string; templateVersion: number }): PatternPreset[] {
  const presets = RECIPES[`${templateId}@${templateVersion}`]?.presets ?? {}
  return Object.entries(presets).map(([id, preset]) => ({ id, label: preset.label }))
}

/**
 * A preset's pattern: the template's own basis and frames, with the preset's
 * pieces laid in those frames top-aligned to the template's pieces (a waist
 * stays where the template's waist is, so a print there stays put). Null when
 * the template has no such preset.
 */
export function patternPresetFor({ templateId, templateVersion, preset }: { templateId: string; templateVersion: number; preset: string }): PatternTemplate | null {
  const build = RECIPES[`${templateId}@${templateVersion}`]?.presets?.[preset]?.build
  const template = build ? patternTemplateFor({ templateId, templateVersion }) : null

  if (!build || !template) {
    return null
  }

  const { pieces, seams } = build()
  const top = (piece: PatternPiece) => Math.max(...(piece.outline ?? []).map((point) => point.y))

  for (const piece of pieces) {
    const base = template.pattern.pieces.find((candidate) => candidate.id === piece.id)

    if (!base) {
      throw new Error(`Preset ${preset} has a piece (${piece.id}) its template lacks`)
    }

    piece.panelOrigin = [base.panelOrigin[0], base.panelOrigin[1] + top(base) - top(piece)]
  }

  return { pattern: { ...template.pattern, pieces, seams }, frames: template.frames }
}
