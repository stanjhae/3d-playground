import { useEffect, useState } from 'react'

import { atlasBuildState, useAtlasBuild } from '../../lib/atlas-status'
import { useEditorStore } from '../../lib/editor-store'

/** A quick load shouldn't flash a message. */
const LOADING_NOTE_DELAY_MS = 400

/** Says when the 3D view isn't the whole design yet (R01 #164). */
export function AtlasStatusNote() {
  const build = useAtlasBuild((state) => state.build)
  const document = useEditorStore((state) => state.document)
  const revision = useEditorStore((state) => state.revision)
  const state = build ? atlasBuildState({ build, document, revision }) : 'ready'
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (state !== 'loading') {
      setShowLoading(false)
      return
    }

    const timer = setTimeout(() => setShowLoading(true), LOADING_NOTE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state])

  const message =
    state === 'error'
      ? 'Some artwork could not load, so the 3D preview is incomplete. Reload the page to try again.'
      : state === 'loading' && showLoading
        ? 'Artwork is still loading, so the 3D preview may be missing some of it.'
        : state === 'fallback'
          ? 'A font could not load, so some words use a stand-in. Reload the page to try again.'
          : null

  return message ? (
    <p
      role="status"
      className="pointer-events-none absolute top-2 left-2 z-10 max-w-[80%] border border-flv-line bg-flv-paper px-3 py-2 font-body text-xs text-flv-ink"
    >
      {message}
    </p>
  ) : null
}
