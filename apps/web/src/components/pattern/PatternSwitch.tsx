import { useState } from 'react'

import { useEditorStore } from '../../lib/editor-store'
import { chromeKickerClass, chromeMutedClass, chromeTextClass } from '../../lib/studio-chrome'

/**
 * Pattern (beta) on the Garment step: draw the garment's real pieces in 2D
 * and the 3D garment is sewn and draped from them. Off by default; turning
 * it off asks first, since pattern edits are dropped.
 */
export function PatternSwitch() {
  const on = useEditorStore((state) => Boolean(state.document.pattern))
  const enablePattern = useEditorStore((state) => state.enablePattern)
  const disablePattern = useEditorStore((state) => state.disablePattern)
  const [busy, setBusy] = useState(false)

  return (
    <section className="flex flex-col gap-1 border-b border-flv-line pb-3" data-testid="pattern-switch">
      <label className={`flex min-h-11 items-center justify-between gap-3 ${chromeTextClass()}`}>
        <span className="flex flex-col">
          <span className={chromeKickerClass()}>Pattern (beta)</span>
          <span className={chromeMutedClass()}>Reshape the garment’s real pieces; the 3D garment is sewn from them.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Pattern (beta)"
          checked={on}
          disabled={busy}
          onChange={async (event) => {
            if (event.target.checked) {
              setBusy(true)
              await enablePattern()
              setBusy(false)
              return
            }

            if (window.confirm('Leave Pattern mode? Your pattern edits go, and the garment goes back to its usual shape. You can undo this.')) {
              disablePattern()
            }
          }}
          className="size-5 accent-flv-accent"
        />
      </label>
    </section>
  )
}
