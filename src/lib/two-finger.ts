export type Point = { x: number; y: number }

/**
 * How two fingers moved between their first touch and now: how far apart
 * they spread (`scale`), how far they turned (`turn`, radians, positive is
 * clockwise on screen) and how far their midpoint travelled (`pan`, px).
 */
export function twoFingerChange({ start, now }: { start: [Point, Point]; now: [Point, Point] }) {
  const span = (pair: [Point, Point]) => Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y)
  const angle = (pair: [Point, Point]) => Math.atan2(pair[1].y - pair[0].y, pair[1].x - pair[0].x)
  const mid = (pair: [Point, Point]) => ({ x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 })
  let turn = angle(now) - angle(start)

  // The shorter way round, so crossing ±π never flips a mark over.
  if (turn > Math.PI) turn -= Math.PI * 2
  if (turn < -Math.PI) turn += Math.PI * 2

  const from = mid(start)
  const to = mid(now)

  return {
    scale: span(now) / Math.max(1, span(start)),
    turn,
    pan: { x: to.x - from.x, y: to.y - from.y },
  }
}

/** The size range the inspector's slider allows, so a pinch never escapes it. */
export const LAYER_SCALE_RANGE = { min: 0.05, max: 0.8 } as const

export function pinchedPlacement({
  scale,
  rotation,
  change,
}: {
  scale: number
  rotation: number
  change: { scale: number; turn: number }
}) {
  return {
    scale: Math.min(LAYER_SCALE_RANGE.max, Math.max(LAYER_SCALE_RANGE.min, scale * change.scale)),
    // Layer rotation runs anticlockwise (panel y points up); screen turn runs clockwise.
    rotation: rotation - change.turn,
  }
}
