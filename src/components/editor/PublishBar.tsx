import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Design } from '../../lib/design-schema'
import { captureFramedStill } from '../../lib/capture-still'
import { useEditorStore } from '../../lib/editor-store'
import { getFabricById } from '../../lib/fabrics'
import { HOUSE_COPY } from '../../lib/house-copy'
import { resolveDraftTitle } from '../../lib/look-title'

let studioCanvas: HTMLCanvasElement | null = null

export function PublishThumbnailSync() {
  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    studioCanvas = gl.domElement

    return () => {
      if (studioCanvas === gl.domElement) {
        studioCanvas = null
      }
    }
  }, [gl])

  return null
}

export function PublishBar({
  title,
  publishing = false,
  onPublish,
}: {
  title?: string
  publishing?: boolean
  onPublish?: ({
    design,
  }: {
    design: Omit<Design, 'id' | 'votes'>
  }) => void | Promise<void>
}) {
  const storeTitle = useEditorStore((state) => state.title)
  const author = useEditorStore((state) => state.author)
  const fabricId = useEditorStore((state) => state.fabricId)
  const garmentId = useEditorStore((state) => state.garmentId)
  const overrides = useEditorStore((state) => state.overrides)
  const lookSerial = useEditorStore((state) => state.lookSerial)
  const fabricName = getFabricById({ id: fabricId ?? '' })?.name ?? 'Look'
  const [titleTouched, setTitleTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const busy = publishing || submitting
  const [draftTitle, setDraftTitle] = useState(() =>
    resolveDraftTitle({
      title,
      storeTitle,
      fabricName,
      serial: lookSerial,
    }),
  )

  useEffect(() => {
    if (titleTouched) {
      return
    }

    setDraftTitle(
      resolveDraftTitle({
        title,
        storeTitle,
        fabricName,
        serial: lookSerial,
      }),
    )
  }, [fabricName, lookSerial, storeTitle, title, titleTouched])

  return (
    <form
      className="flex flex-row flex-wrap items-end gap-2 border border-atelier-line bg-atelier/92 p-3 backdrop-blur-sm sm:gap-3 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault()

        if (busy || submittingRef.current) {
          return
        }

        submittingRef.current = true

        const resolvedTitle =
          draftTitle.trim() ||
          resolveDraftTitle({
            fabricName,
            serial: lookSerial,
          })

        setSubmitting(true)

        void captureFramedStill({ canvas: studioCanvas }).then((thumbnailDataUrl) =>
          Promise.resolve(
            onPublish?.({
              design: {
                title: resolvedTitle,
                author: author || 'Guest',
                thumbnailDataUrl,
                overrides: [...overrides],
                garmentId,
              },
            }),
          ),
        )
          .finally(() => {
            submittingRef.current = false
            setSubmitting(false)
          })
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-display text-xs tracking-[0.22em] text-brass uppercase">
          Look title
        </span>
        <input
          value={draftTitle}
          disabled={busy}
          onChange={(event) => {
            setTitleTouched(true)
            setDraftTitle(event.target.value)
          }}
          className="min-h-11 border border-atelier-line bg-atelier px-3 py-2 text-ivory disabled:opacity-50"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 shrink-0 border border-brass px-4 py-2 font-display text-xs tracking-[0.18em] text-brass uppercase hover:bg-atelier disabled:opacity-50 sm:px-5"
      >
        {busy ? HOUSE_COPY.entering : HOUSE_COPY.enter}
      </button>
    </form>
  )
}
