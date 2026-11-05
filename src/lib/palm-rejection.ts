/**
 * Palm rejection for pen drawing (UI plan, Phase 3, iPad). Once a pen has
 * drawn, on a panel or on the tee, a finger or resting palm no longer draws: on a
 * tablet the hand holding the pencil lands on the screen too. A page that
 * has never seen a pen keeps finger drawing.
 */
let penSeen = false

export function acceptsPointer({ pointerType }: { pointerType: string }) {
  if (pointerType === 'pen') {
    penSeen = true
    return true
  }

  return !(penSeen && pointerType === 'touch')
}

/** For tests. */
export function resetPalmRejection() {
  penSeen = false
}
