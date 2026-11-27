import type { DesignDocument } from './design-document'
import { panelGuides } from './panel-guides'

/**
 * Snapping while an item is dragged on a 2D panel (A4). A moving item's
 * centre pulls to the panel's centre line, the chest (or shoulder-blade)
 * line, and the centres of the other items on the same panel. Rotation pulls
 * to the nearest quarter turn. Holding Alt (Option) turns it off.
 *
 * Panel units throughout: x from the left, y from the bottom, both 0 to 1.
 */

/** How close, in screen pixels, before an item snaps. */
export const SNAP_PIXELS = 8

/** How close, in radians, before a rotation snaps to a quarter turn (about 4°). */
export const SNAP_ROTATION = (4 * Math.PI) / 180

export type SnapGuide = { axis: 'x' | 'y'; value: number }

export type SnapTargets = { xs: number[]; ys: number[] }

/** The chest or shoulder-blade line, in panel y; null on panels without one. */
export function chestLineY({ panel }: { panel: string }) {
  const guides = panelGuides({ panel })
  return guides ? 1 - guides.chestFromTop : null
}

/** Where an item on `panel` may snap to, leaving out `layerId` itself. */
export function snapTargets({
  document,
  panel,
  layerId,
  withChest = true,
}: {
  document: DesignDocument
  panel: string
  layerId: string
  /** Concept garments have no measured chest. */
  withChest?: boolean
}): SnapTargets {
  const xs = [0.5]
  const ys: number[] = []
  const chest = withChest ? chestLineY({ panel }) : null

  if (chest !== null) {
    ys.push(chest)
  }

  for (const layer of document.layers) {
    if (layer.id === layerId || !layer.visible || !('panel' in layer) || layer.panel !== panel || !('x' in layer)) {
      continue
    }

    xs.push(layer.x)
    ys.push(layer.y)
  }

  return { xs, ys }
}

function nearest({ value, targets, within }: { value: number; targets: number[]; within: number }) {
  let best: number | null = null

  for (const target of targets) {
    const distance = Math.abs(target - value)

    if (distance <= within && (best === null || distance < Math.abs(best - value))) {
      best = target
    }
  }

  return best
}

/** The snapped centre and the guides to draw for it. */
export function snapMove({
  x,
  y,
  targets,
  withinX,
  withinY,
}: {
  x: number
  y: number
  targets: SnapTargets
  /** The snap distance in panel units, from `SNAP_PIXELS` and the panel's size on screen. */
  withinX: number
  withinY: number
}): { x: number; y: number; guides: SnapGuide[] } {
  const snappedX = nearest({ value: x, targets: targets.xs, within: withinX })
  const snappedY = nearest({ value: y, targets: targets.ys, within: withinY })
  const guides: SnapGuide[] = []

  if (snappedX !== null) {
    guides.push({ axis: 'x', value: snappedX })
  }

  if (snappedY !== null) {
    guides.push({ axis: 'y', value: snappedY })
  }

  return { x: snappedX ?? x, y: snappedY ?? y, guides }
}

/** A rotation pulled to the nearest quarter turn when it is close. */
export function snapRotation({ rotation, within = SNAP_ROTATION }: { rotation: number; within?: number }) {
  const quarter = Math.PI / 2
  const target = Math.round(rotation / quarter) * quarter
  return Math.abs(target - rotation) <= within ? target : rotation
}
