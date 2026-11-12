import { useEffect, useId, useState } from 'react'

import { useStudioMode } from '../../lib/studio-mode'
import { cn } from '../../lib/cn'
import { announce } from '../../lib/studio-announcer'

/** What Pro adds, said where it's switched: the tester saw no difference. */
export const PRO_TOOLS_ADDS =
  'brush colour, size and opacity; exact size, angle and X/Y numbers; copy to the opposite side; named checkpoints and versions'

export function ProToolsSwitch() {
  const pro = useStudioMode((state) => state.pro)
  const setPro = useStudioMode((state) => state.setPro)
  const describedBy = useId()
  // A moment's note after switching, so the change is seen, not guessed.
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!note) {
      return
    }

    const timer = window.setTimeout(() => setNote(null), 6000)
    return () => window.clearTimeout(timer)
  }, [note])

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={pro}
        aria-describedby={describedBy}
        title={`Pro tools add ${PRO_TOOLS_ADDS}.`}
        onClick={() => {
          const next = !pro
          setPro({ pro: next })
          const message = next ? `Pro tools on: ${PRO_TOOLS_ADDS}.` : 'Pro tools off: the simpler controls are back.'
          setNote(message)
          announce({ message })
        }}
        className="inline-flex min-h-11 items-center gap-2 font-body text-sm whitespace-nowrap text-flv-muted hover:text-flv-ink"
      >
        <span
          aria-hidden
          className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', {
            'bg-flv-ink': pro,
            'bg-flv-line': !pro,
          })}
        >
          <span
            className={cn('absolute top-0.5 left-0 size-4 rounded-full bg-white shadow transition-transform', {
              'translate-x-4.5': pro,
              'translate-x-0.5': !pro,
            })}
          />
        </span>
        Pro tools
      </button>
      <span id={describedBy} className="sr-only">
        Adds {PRO_TOOLS_ADDS}.
      </span>
      {note ? (
        <span
          aria-hidden
          className="flv-panel absolute top-full left-0 z-40 mt-1 w-[min(18rem,calc(100vw-2rem))] p-2 font-body text-xs text-flv-ink shadow-md"
        >
          {note}
        </span>
      ) : null}
    </span>
  )
}
