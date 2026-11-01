/**
 * Selection chrome: the bounding box and handles drawn around the selected
 * mark on a panel canvas, and the outline on a picked or hovered mesh.
 * They are studio-only. Published art comes from `rasterizeLayers`, which
 * never sees the selection, and stills are taken from the 3D canvas with
 * the outline off while the views are captured (#156).
 */

export const SELECTION_COLOR = '#c4a15a'

export function meshOutlineVisible({
  canPick,
  isSelected,
  hovered,
  capturingAngles,
}: {
  canPick: boolean
  isSelected: boolean
  hovered: boolean
  capturingAngles: boolean
}) {
  return canPick && !capturingAngles && (isSelected || hovered)
}
