import { TEXT_CURVE_MAX } from './canonical-document'

/**
 * A word set along an arc (tester, 22 Nov: "arranging text in a circle or
 * along an arc"). `curve` runs −1…1: 0 is straight, 1 bends the word up
 * into a full circle (a badge's top edge), −1 down into one (a smile).
 * The word keeps its length; the tighter the curve, the smaller the circle.
 */
export type ArcGeometry = {
  /** Circle radius, in the word's units (its straight length is `length`). */
  radius: number
  /** Angle the word spans, radians. */
  sweep: number
  /** Width of the arc's bounding box. */
  chord: number
  /** Depth of the arc: how far the ends sit from the middle, across the word. */
  sagitta: number
  /** +1 bends up (centre below), −1 down (centre above). */
  direction: 1 | -1
}

export function arcGeometry({ length, curve }: { length: number; curve: number }): ArcGeometry | null {
  const amount = Math.min(TEXT_CURVE_MAX, Math.abs(curve))

  if (amount < 0.005 || length <= 0) {
    return null
  }

  const sweep = amount * Math.PI * 2
  const radius = length / sweep
  const half = sweep / 2

  return {
    radius,
    sweep,
    chord: half >= Math.PI / 2 ? 2 * radius : 2 * radius * Math.sin(half),
    sagitta: radius * (1 - Math.cos(Math.min(half, Math.PI))),
    direction: curve > 0 ? 1 : -1,
  }
}

/**
 * Where a glyph sits on the arc, in canvas axes (y down), for the glyph whose
 * centre is `offset` along the word from its middle. The arc's bounding box
 * is centred on the origin, so the word stays where it was placed.
 */
export function arcGlyph({ arc, offset }: { arc: ArcGeometry; offset: number }) {
  const angle = offset / arc.radius
  // Up-bend: the middle is highest, the ends drop (canvas y grows down).
  const drop = arc.radius * (1 - Math.cos(angle))

  return {
    x: arc.radius * Math.sin(angle),
    y: arc.direction * (drop - arc.sagitta / 2),
    rotation: arc.direction * angle,
  }
}

/** The box a curved word fills, from its straight box. */
export function curvedBox({ width, height, curve }: { width: number; height: number; curve: number }) {
  const arc = arcGeometry({ length: width, curve })

  if (!arc) {
    return { width, height }
  }

  return {
    width: Math.max(arc.chord + height * Math.min(1, arc.sweep / Math.PI), height),
    height: arc.sagitta + height,
  }
}
