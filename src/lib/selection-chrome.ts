/**
 * Selection chrome: the bounding box and handles drawn around the selected
 * mark on a panel canvas, and the outline on a picked or hovered mesh.
 * They are studio-only. Published art comes from `rasterizeLayers`, which
 * never sees the selection, and stills are taken from the 3D canvas with
 * the outline off while the views are captured (#156).
 */

export const SELECTION_COLOR = '#c4a15a'

/**
 * A garment draped from its pattern (`body-pattern`: a baked GLB, or the live
 * drape in Pattern mode) is one open layer of cloth. The outline is an
 * inflated back-facing shell, so on it the shell shows through the neck,
 * armholes and hem as a gold lining instead of an edge: it gets none.
 */
export function isOpenClothMesh({ name }: { name: string }) {
  return name === 'body-pattern'
}

export function meshOutlineVisible({
  canPick,
  isSelected,
  hovered,
  capturingAngles,
  openCloth = false,
}: {
  canPick: boolean
  isSelected: boolean
  hovered: boolean
  capturingAngles: boolean
  openCloth?: boolean
}) {
  return canPick && !capturingAngles && !openCloth && (isSelected || hovered)
}
