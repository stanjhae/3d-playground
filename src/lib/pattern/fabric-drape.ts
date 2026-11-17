import { getFabricById } from '../fabrics.ts'
import type { CanonicalPattern, PatternFabric, PatternPiece } from './pattern-document.ts'

/**
 * Fabric drives the drape (B3): the render fabric a person picks (a
 * preset in `fabrics.ts`) names the cloth the pattern is cut from, so
 * chiffon falls soft and canvas stands stiff.
 *
 * Presets are matched by their texture (`mapId`), which every colourway
 * of a cloth shares ("Blush Silk" is silk). Cotton drapes as jersey: the
 * tee, the garment Pattern mode starts on, is a cotton jersey template.
 */
const DRAPE_BY_MAP_ID: Readonly<Record<string, PatternFabric>> = {
  'cotton-weave': 'jersey',
  'jersey-knit': 'jersey',
  'denim-twill': 'denim',
  'silk-shine': 'satin',
  'satin-sheen': 'satin',
  'wool-nap': 'wool',
  'linen-slub': 'linen',
  'chiffon-gauze': 'chiffon',
  'canvas-duck': 'canvas',
  'leather-grain': 'firm',
}

/** The base presets by id, for a preset without a texture of its own. */
const DRAPE_BY_PRESET_ID: Readonly<Record<string, PatternFabric>> = {
  cotton: 'jersey',
  jersey: 'jersey',
  denim: 'denim',
  silk: 'satin',
  satin: 'satin',
  wool: 'wool',
  linen: 'linen',
  chiffon: 'chiffon',
  canvas: 'canvas',
  leather: 'firm',
}

/**
 * The simulation fabric for a render fabric: by `mapId` when given, else
 * by preset id (its texture first, then its name). Null for a finish with
 * no cloth behind it, which leaves the drape alone.
 */
export function drapeFabricFor({ fabricId, mapId }: { fabricId?: string | null; mapId?: string | null }): PatternFabric | null {
  if (mapId && DRAPE_BY_MAP_ID[mapId]) {
    return DRAPE_BY_MAP_ID[mapId]
  }

  if (!fabricId) {
    return null
  }

  const presetMap = getFabricById({ id: fabricId })?.mapId
  return (presetMap ? DRAPE_BY_MAP_ID[presetMap] : undefined) ?? DRAPE_BY_PRESET_ID[fabricId] ?? null
}

/** A hood, or a trim or band (a cuff, a collar, a waistband): ids and print panels that say so. */
const HELD_NAME = /hood|band|trim|cuff|collar|rib|binding|placket/i

/**
 * Whether a piece keeps its own fabric when the garment's changes: the
 * hood (the template forces fleece) and any trim or band, which are cut
 * from their own cloth. A mirror follows its source.
 */
export function keepsOwnFabric({ piece, pattern }: { piece: PatternPiece; pattern: CanonicalPattern }): boolean {
  if (piece.roles?.hood || HELD_NAME.test(piece.id) || HELD_NAME.test(piece.panel)) {
    return true
  }

  if (piece.mirrorOf) {
    const source = pattern.pieces.find((entry) => entry.id === piece.mirrorOf)
    return source ? keepsOwnFabric({ piece: source, pattern }) : false
  }

  return false
}

/**
 * The pattern cut from `fabric`: every piece but the held ones (hood,
 * trims, bands) takes it. The same object back when nothing changes.
 */
export function withDrapeFabric({ pattern, fabric }: { pattern: CanonicalPattern; fabric: PatternFabric }): CanonicalPattern {
  if (pattern.pieces.every((piece) => piece.fabric === fabric || keepsOwnFabric({ piece, pattern }))) {
    return pattern
  }

  return {
    ...pattern,
    pieces: pattern.pieces.map((piece) => (piece.fabric === fabric || keepsOwnFabric({ piece, pattern }) ? piece : { ...piece, fabric })),
  }
}
