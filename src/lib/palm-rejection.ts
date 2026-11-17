/**
 * Palm rejection for pen drawing (UI plan, Phase 3, iPad). While a pen is in
 * use, on a panel or on the tee, a finger or resting palm doesn't draw: on a
 * tablet the hand holding the pencil lands on the screen too. A page that
 * has never seen a pen keeps finger drawing, and so does one whose pen has
 * been put down for a while, so a finger works again without a reload.
 */

/** How long after the pen was last seen (drawing or hovering) a finger counts as a palm. */
export const PEN_REST_MS = 30_000

let penSeenAt: number | null = null

export function acceptsPointer({ pointerType, now = Date.now() }: { pointerType: string; now?: number }) {
  if (pointerType === 'pen') {
    penSeenAt = now
    return true
  }

  if (pointerType !== 'touch' || penSeenAt === null) {
    return true
  }

  return now - penSeenAt > PEN_REST_MS
}

/** For tests. */
export function resetPalmRejection() {
  penSeenAt = null
}
