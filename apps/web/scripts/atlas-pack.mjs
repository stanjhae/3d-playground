// Packing print panels into a square atlas, shared by build-template.mjs
// (panel boxes in metres) and bake-pattern-glb.mjs (pattern frames in mm).

// Transparent gap between packed panels, in atlas pixels. The app bleeds
// each panel's edge pixels into it (paint-atlas.ts), so a texture sampled at
// a lower mip level still finds the panel's colour at its rim. A template
// may ask for more (`"padding"` in its piece map); older bakes keep 8.
export const PADDING_PX = 8

/** Shelf-pack panel boxes (metres) into a square atlas at the largest shared scale. */
export function packPanels({ boxes, size, padding = PADDING_PX }) {
  const PADDING_PX = padding
  const fits = (scale) => {
    const order = boxes
      .map((box, index) => ({ index, width: box.width * scale, height: box.height * scale }))
      .sort((a, b) => b.height - a.height)
    const placed = []
    let x = PADDING_PX
    let y = PADDING_PX
    let shelf = 0

    for (const item of order) {
      if (x + item.width + PADDING_PX > size) {
        x = PADDING_PX
        y += shelf + PADDING_PX
        shelf = 0
      }
      if (x + item.width + PADDING_PX > size || y + item.height + PADDING_PX > size) {
        return null
      }
      placed[item.index] = { x, y, width: item.width, height: item.height }
      x += item.width + PADDING_PX
      shelf = Math.max(shelf, item.height)
    }
    return placed
  }

  // Boxes in metres fit at 1 px per unit; pattern frames in millimetres as
  // large as a dress's (over a metre tall) need less than that.
  let low = fits(1) ? 1 : 0
  let high = size * 10

  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2
    if (fits(middle)) low = middle
    else high = middle
  }

  return { scale: low, placed: fits(low) }
}

export function round({ value }) {
  return Math.round(value * 1e6) / 1e6
}


/** Packed spots as atlas UV rectangles, v up like the tee: v1 is the top of the atlas (CanvasTexture flipY). */
export function atlasRects({ placed, size }) {
  return placed.map((spot) => ({
    u0: round({ value: spot.x / size }),
    u1: round({ value: (spot.x + spot.width) / size }),
    v0: round({ value: 1 - (spot.y + spot.height) / size }),
    v1: round({ value: 1 - spot.y / size }),
  }))
}
