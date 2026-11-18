import { useState } from 'react'

import { cn } from '../../lib/cn'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import { announce } from '../../lib/studio-announcer'
import { chromeTextClass } from '../../lib/studio-chrome'
import { canUpgradeTemplate, upgradeKeepsSize } from '../../lib/template-upgrade'

/**
 * A design saved on an earlier tee keeps opening on it, since saved designs
 * are never quietly remapped. This offers the newest one instead, in one
 * click that Undo takes back: from the early drawn tee (`@1`–`@3`) sizes can
 * shift, from the earlier real tee (`@4` to `@6`) marks keep their size and place.
 */
export function TemplateUpgradeBanner() {
  const upgradeTemplate = useEditorStore((state) => state.upgradeTemplate)
  // Recomputed whenever the document changes (its revision moves).
  const offer = useEditorStore((state) => {
    void state.document
    return state.cloud !== null && canUpgradeTemplate({ document: getCanonicalDocument() })
  })
  const keepsSize = useEditorStore((state) => {
    void state.document
    return upgradeKeepsSize({ document: getCanonicalDocument() })
  })
  const [dismissed, setDismissed] = useState(false)

  if (!offer || dismissed) {
    return null
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-sm text-flv-ink">
      <span>
        {keepsSize
          ? 'This design is on our earlier 3D T-shirt. The new one prints right round the body and both sleeves, and sleeve marks show the right way up; your marks keep their size and place. Undo takes it back.'
          : 'This design is on our earlier, simpler T-shirt. On the new 3D one your marks keep their places, but sizes can shift a little, so check each side. Undo takes it back.'}
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
