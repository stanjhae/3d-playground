import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useState } from 'react'

import type { Design } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { getFabricById } from '../../lib/fabrics'
import { resolveDraftTitle } from '../../lib/look-title'

let lookSerial = 1
let studioCanvas: HTMLCanvasElement | null = null

function captureCanvasThumbnail() {
  if (!studioCanvas) {
    return ''
  }

  try {
    return studioCanvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

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
  onPublish,
}: {
  title?: string
  onPublish?: ({
    design,
  }: {
    design: Omit<Design, 'id' | 'votes'>
  }) => void
}) {
  const storeTitle = useEditorStore((state) => state.title)
  const author = useEditorStore((state) => state.author)
  const fabricId = useEditorStore((state) => state.fabricId)
  const overrides = useEditorStore((state) => state.overrides)
  const fabricName = getFabricById({ id: fabricId ?? '' })?.name ?? 'Look'
  const [titleTouched, setTitleTouched] = useState(false)
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
  }, [fabricName, storeTitle, title, titleTouched])

  return (
    <form
      className="flex flex-col gap-4 border border-atelier-line bg-atelier-raised p-5 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()

        const resolvedTitle =
          draftTitle.trim() ||
          resolveDraftTitle({
            fabricName,
            serial: lookSerial,
          })

        lookSerial += 1

        onPublish?.({
          design: {
            title: resolvedTitle,
            author: author || 'Guest',
            thumbnailDataUrl: captureCanvasThumbnail(),
            overrides: [...overrides],
          },
        })
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-display text-xs tracking-[0.22em] text-brass uppercase">
          Look title
        </span>
        <input
          value={draftTitle}
          onChange={(event) => {
            setTitleTouched(true)
            setDraftTitle(event.target.value)
          }}
          className="border border-atelier-line bg-atelier px-3 py-2 text-ivory"
        />
      </label>
      <p className="text-sm text-ivory-muted">
        By {author || 'Guest'}
      </p>
      <button
        type="submit"
        className="border border-brass px-5 py-2 font-display text-xs tracking-[0.18em] text-brass uppercase hover:bg-atelier"
      >
        Enter the Vote
      </button>
    </form>
  )
}
