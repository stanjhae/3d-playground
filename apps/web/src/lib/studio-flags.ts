/**
 * Build-time switches for studio work landing before the 1 Dec alpha
 * (`docs/release.md`). Each guards an entry point only; values are settled
 * before a candidate is tagged.
 */

/**
 * A2: draw a live stroke over a cached design instead of redrawing the whole
 * design for every point. Pixel-identical to a full redraw
 * (`live-atlas.test.ts`), so it is on unless `VITE_FLP_LIVE_STROKE_CACHE=false`.
 */
export const LIVE_STROKE_CACHE = import.meta.env.VITE_FLP_LIVE_STROKE_CACHE !== 'false'
