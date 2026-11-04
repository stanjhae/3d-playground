import { useState } from 'react'

import { useEditorStore } from '../../lib/editor-store'
import { allHintsHidden, nextHint, readDismissedHints, writeDismissedHints } from '../../lib/studio-hints'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'
import { cn } from '../../lib/cn'

function hintStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** One short hint in the tools rail, in the flow so it never covers the work. */
export function StudioHint() {
  const step = useEditorStore((state) => state.createStep)
  const [dismissed, setDismissed] = useState(() => readDismissedHints({ storage: hintStorage() }))
  const hint = nextHint({ step, dismissed })

  if (!hint) {
    return null
  }

  function update(next: string[]) {
    setDismissed(next)
    writeDismissedHints({ storage: hintStorage(), dismissed: next })
  }

  return (
    <aside className={railFrameClass()} aria-label="Hint">
      <p className={chromeKickerClass()}>{hint.title}</p>
      <p className={chromeMutedClass()}>{hint.text}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={cn('min-h-9 text-flv-ink underline-offset-2 hover:underline', chromeTextClass())}
          onClick={() => update([...dismissed, hint.id])}
        >
          Got it
        </button>
        <button
          type="button"
          className={cn('min-h-9 text-flv-muted underline-offset-2 hover:underline', chromeTextClass())}
          onClick={() => update(allHintsHidden())}
        >
          Hide all hints
        </button>
      </div>
    </aside>
  )
}
