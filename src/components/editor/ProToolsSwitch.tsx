import { Info } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

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
  // A moment's note after switching (`switched`), so the change is seen, not
  // guessed; or what Pro adds, from the info button (`explain`).
  const [note, setNote] = useState<{ kind: 'switched' | 'explain'; text: string } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  // Where the note sits on screen: below the switch, but kept inside the
  // viewport. Anchored to the switch it ran off the right edge of a phone,
  // where the studio's overflow clipped it away.
  const [noteAt, setNoteAt] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!note || !anchor.current) {
      setNoteAt(null)
      return
    }

    const box = anchor.current.getBoundingClientRect()
    const width = Math.min(288, window.innerWidth - 16)
    setNoteAt({
      top: box.bottom + 4,
      left: Math.min(Math.max(8, box.left), window.innerWidth - width - 8),
      width,
    })
  }, [note])

  useEffect(() => {
    if (!note) {
      return
    }

    const timer = window.setTimeout(() => setNote(null), 6000)
    // The note is placed on screen once, when it opens: a scroll (of the page
    // or a panel) or a resize would leave it floating over something else, so
    // it closes instead.
    const close = () => setNote(null)
    window.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [note])

  return (
    <span ref={anchor} className="relative inline-flex">
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
          setNote({ kind: 'switched', text: message })
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
      {/* The tooltip never shows on a phone, and the note only after switching:
          this says what Pro adds before anyone switches it on. */}
      <button
        type="button"
        aria-label="What Pro tools add"
        // Read on focus, as the switch's own description is; the note itself
        // is visual only.
        aria-describedby={describedBy}
        onClick={() => {
          // A second tap closes the explanation, silently. Any other note
          // (the one after switching) gives way to the explanation.
          if (note?.kind === 'explain') {
            setNote(null)
            return
          }

          const message = `Pro tools add ${PRO_TOOLS_ADDS}.`
          setNote({ kind: 'explain', text: message })
          announce({ message })
        }}
        // No double-tap-to-zoom on phones, so a second tap is a tap.
        className="inline-flex size-11 touch-manipulation items-center justify-center text-flv-muted hover:text-flv-ink"
      >
        <Info aria-hidden className="size-4" />
      </button>
      <span id={describedBy} className="sr-only">
        Adds {PRO_TOOLS_ADDS}.
      </span>
      {note && noteAt ? (
        <span
          aria-hidden
          // Fixed, so the studio's clipped frame can't cut it off.
          style={{ top: noteAt.top, left: noteAt.left, width: noteAt.width }}
          className="flv-panel fixed z-50 p-2 font-body text-xs text-flv-ink shadow-md"
        >
          {note.text}
        </span>
      ) : null}
    </span>
  )
}
