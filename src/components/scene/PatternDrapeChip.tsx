import { usePatternDrape } from '../../lib/pattern-drape-status'

/** Says when a Pattern (beta) garment is being draped, or couldn't be. */
export function PatternDrapeChip() {
  const state = usePatternDrape((status) => status.state)
  const progress = usePatternDrape((status) => status.progress)

  if (state !== 'draping' && state !== 'failed') {
    return null
  }

  return (
    <p
      role="status"
      data-testid="pattern-drape"
      className="pointer-events-none absolute bottom-2 left-2 z-10 border border-flv-line bg-flv-paper px-3 py-2 font-body text-xs text-flv-ink"
    >
      {state === 'draping'
        ? `Draping your pattern… ${Math.round(progress * 100)}%`
        : 'This pattern couldn’t be draped. Undo the last change, or try another.'}
    </p>
  )
}
