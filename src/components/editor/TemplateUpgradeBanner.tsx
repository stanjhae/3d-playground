import { useState } from 'react'

import { cn } from '../../lib/cn'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import { announce } from '../../lib/studio-announcer'
import { chromeTextClass } from '../../lib/studio-chrome'
import { canUpgradeTemplate } from '../../lib/template-upgrade'

/**
 * A design saved on the early, drawn tee (`@1`–`@3`) keeps opening on it,
 * since saved designs are never quietly remapped. This offers the real 3D
 * tee instead, in one click that Undo takes back.
 */
export function TemplateUpgradeBanner() {
  const upgradeTemplate = useEditorStore((state) => state.upgradeTemplate)
  // Recomputed whenever the document changes (its revision moves).
  const offer = useEditorStore((state) => {
    void state.document
    return state.cloud !== null && canUpgradeTemplate({ document: getCanonicalDocument() })
  })
  const [dismissed, setDismissed] = useState(false)

  if (!offer || dismissed) {
    return null
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-sm text-flv-ink">
      <span>
        This design is on our earlier, simpler T-shirt. On the new 3D one your marks keep their places, but sizes can
        shift a little, so check each side. Undo takes it back.
      </span>
      <button
        type="button"
        className={cn('min-h-9 text-flv-accent underline underline-offset-2', chromeTextClass())}
        onClick={() => {
          if (upgradeTemplate()) {
            announce({ message: 'Moved onto the new 3D T-shirt. Check each side; Undo takes it back.' })
          }
        }}
      >
        Use the new 3D T-shirt
      </button>
      <button
        type="button"
        className={cn('min-h-9 text-flv-muted underline-offset-2 hover:underline', chromeTextClass())}
        onClick={() => setDismissed(true)}
      >
        Not now
      </button>
    </div>
  )
}
