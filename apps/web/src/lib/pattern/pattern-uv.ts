/**
 * Where a point on a pattern piece lands on its print panel: panel-
 * normalised [0, 1], origin bottom-left, y up (docs/canonical-document.md).
 * Each panel has a fixed frame in millimetres from its pattern template, so
 * reshaping a piece never moves the print: an edit only changes which part
 * of the frame the cloth covers.
 */
export type PanelFrame = {
  width: number
  height: number
  /**
   * The panel reads as if seen through the body from the front (the back
   * panel's x runs toward the wearer's left), while a piece's x runs to the
   * right as seen from outside. True flips one onto the other.
   */
  mirrorX?: boolean
}

export function pieceToPanel({
  x,
  y,
  panelOrigin,
  frame,
}: {
  x: number
  y: number
  panelOrigin: readonly [number, number]
  frame: PanelFrame
}): [number, number] {
  const u = (panelOrigin[0] + x) / frame.width
  const v = (panelOrigin[1] + y) / frame.height
  return [frame.mirrorX ? 1 - u : u, v]
}

/** The panel-normalised position of every particle, from its piece and flat position. */
export function particlePanelUv({
  flat,
  pieceOf,
  pieces,
  frames,
}: {
  /** Millimetres, xy per particle. */
  flat: Float64Array
  pieceOf: Uint16Array
  pieces: readonly { panel: string; panelOrigin: readonly [number, number] }[]
  frames: Record<string, PanelFrame>
}): Float32Array {
  const out = new Float32Array(pieceOf.length * 2)

  for (let i = 0; i < pieceOf.length; i += 1) {
    const piece = pieces[pieceOf[i]!]!
    const frame = frames[piece.panel]

    if (!frame) {
      out[i * 2] = -1
      out[i * 2 + 1] = -1
      continue
    }

    const [u, v] = pieceToPanel({ x: flat[i * 2]!, y: flat[i * 2 + 1]!, panelOrigin: piece.panelOrigin, frame })
    out[i * 2] = u
    out[i * 2 + 1] = v
  }

  return out
}
