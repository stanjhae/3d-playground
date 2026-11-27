import { addAfterEffect } from '@react-three/fiber'
import { useEffect } from 'react'

import { createEditRenderTiming } from '../../lib/edit-render-timing'
import { useEditorStore } from '../../lib/editor-store'

/** Times each design edit to the next frame the studio draws (Q08 #193). */
export function EditRenderProbe() {
  useEffect(() => {
    const timing = createEditRenderTiming()
    const stopEdits = useEditorStore.subscribe((state, previous) => {
      if (state.revision !== previous.revision && document.visibilityState === 'visible') {
        timing.edited()
      }
    })
    const stopFrames = addAfterEffect(() => timing.drew())
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        timing.hidden()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopEdits()
      stopFrames()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
