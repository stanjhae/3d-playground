/**
 * Selection chrome: the bounding box and handles drawn around the selected
 * mark on a panel canvas, and the outline on a picked or hovered mesh.
 * They are studio-only. Published art comes from `rasterizeLayers`, which
 * never sees the selection, and stills are taken from the 3D canvas with
 * the outline off while the views are captured (#156).
 */

/** The house accent (`--color-flv-accent`): what is selected reads as the thing being edited (tester, 22 Nov). */
export const SELECTION_COLOR = '#e0141f'

/**
 * Whether a mesh is one open layer of cloth. The outline is an inflated
 * back-facing shell, so on such a mesh the shell shows through the neck,
 * armholes, cuffs and hem as a speckled lining instead of an edge: it
 * gets none. That is
 * - a garment draped from its pattern (`body-pattern`: a baked GLB, or the
 *   live drape in Pattern mode), and
 * - every piece of a template-built garment (`printUv`: it carries print
 *   UVs, `scripts/build-template.mjs`). They are simulated cloth, one layer
 *   thick: on the real tee the gold showed inside the collar and the cuffs
 *   of every new design (founder beta, 19 Nov).
 * The early drawn tee (`@1`–`@3`) is a closed shell and keeps its outline.
 */
export function isOpenClothMesh({ name, printUv = false }: { name: string; printUv?: boolean }) {
  return name === 'body-pattern' || printUv
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
