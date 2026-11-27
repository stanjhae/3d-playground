import { Download } from 'lucide-react'
import { create } from 'zustand'

import { isLiveStudioCanvas } from '../../lib/capture-still'
import { cn } from '../../lib/cn'
import {
  designSheetCanvas,
  downloadCanvas,
  exportFileName,
  studioViewCanvas,
} from '../../lib/design-export'
import { useEditorStore } from '../../lib/editor-store'
import { OUTLINE_COLOR } from '../../lib/outline-view'
import { outsideVeil, panelOutline, usePanelShapes } from '../../lib/panel-shape'
import { announce } from '../../lib/studio-announcer'
import { chromeKickerClass, chromeMutedClass, chromeTextClass } from '../../lib/studio-chrome'
import { getStudioCanvas } from './PublishBar'

const useDownloadImage = create<{
  withSides: boolean
  busy: boolean
  failed: boolean
  setWithSides: (input: { withSides: boolean }) => void
}>((set) => ({
  withSides: false,
  busy: false,
  failed: false,
  setWithSides: ({ withSides }) => set({ withSides }),
}))

/** The design's name for the file and the sheet's heading. */
function designTitle() {
  const state = useEditorStore.getState()
  return state.cloud?.title || state.title || ''
}

/**
 * Saves a PNG of the 3D view as it is on screen, or (with the flat sides)
 * a sheet of the 3D view beside every side. The button below and
 * Shift + ⌘ E (`studio-keys.ts`) both come here.
 */
export async function downloadDesignImage() {
  const store = useDownloadImage.getState()

  if (store.busy) {
    return false
  }

  useDownloadImage.setState({ busy: true, failed: false })

  try {
    const view = studioViewCanvas({ canvas: getStudioCanvas() })
    const state = useEditorStore.getState()
    const title = designTitle()
    const withSides = store.withSides
    const shapes = usePanelShapes.getState()
    const modelSrc = state.document.modelSrc
    const canvas = withSides
      ? await designSheetCanvas({
          document: state.document,
          garmentId: state.garmentId,
          title,
          view,
          overlays: ({ panel, width, height }) => {
            const triangles = modelSrc && shapes.src === modelSrc ? shapes.shapes[panel] : undefined
            return modelSrc && triangles
              ? [
                  outsideVeil({ src: modelSrc, panel, triangles, width, height }),
                  panelOutline({ src: modelSrc, panel, triangles, width, height, color: OUTLINE_COLOR, lineWidth: 2 }),
                ]
              : []
          },
        })
      : view
    const saved = canvas
      ? await downloadCanvas({ canvas, fileName: exportFileName({ title, kind: withSides ? 'sheet' : '3d', date: new Date() }) })
      : false

    useDownloadImage.setState({ failed: !saved })
    announce({ message: saved ? 'Image downloaded.' : 'The image could not be made. Try again once the 3D view has loaded.' })
    return saved
  } finally {
    useDownloadImage.setState({ busy: false })
  }
}

/** Whether there is a 3D view to save, for the keyboard shortcut. */
export function canDownloadDesignImage() {
  return isLiveStudioCanvas({ canvas: getStudioCanvas() })
}

/** "Download image" in Preview & Publish (UX review, 26 Nov). */
export function DownloadImage() {
  const withSides = useDownloadImage((state) => state.withSides)
  const busy = useDownloadImage((state) => state.busy)
  const failed = useDownloadImage((state) => state.failed)
  const setWithSides = useDownloadImage((state) => state.setWithSides)

  return (
    <section aria-labelledby="download-image-title" className="flex w-full flex-col gap-2" data-testid="download-image">
      <p id="download-image-title" className={chromeKickerClass()}>
        Download image
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          disabled={busy}
          aria-keyshortcuts="Shift+Meta+E Shift+Control+E"
          onClick={() => {
            void downloadDesignImage()
          }}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 border border-flv-line px-4 py-2 text-flv-ink hover:text-flv-accent disabled:opacity-50',
            chromeTextClass(),
          )}
        >
          <Download aria-hidden className="size-4" />
          {busy ? 'Preparing…' : 'Download PNG'}
        </button>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={withSides}
            onChange={() => setWithSides({ withSides: !withSides })}
            className="accent-[var(--color-flv-accent)]"
          />
          <span className={chromeTextClass()}>With the flat sides</span>
        </label>
      </div>
      <p className={chromeMutedClass()}>
        {failed
          ? 'The image could not be made. Try again once the 3D view has loaded.'
          : withSides
            ? 'The 3D view as it is now, beside every flat side.'
            : 'The 3D view as it is now. Turn the garment first to choose the angle.'}
      </p>
    </section>
  )
}

/** The phone's Download image: one round button on the 3D stage, the 3D view only. */
export function DownloadImageButton() {
  const busy = useDownloadImage((state) => state.busy)

  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Download image"
      title="Download image"
      data-testid="download-image-button"
      onClick={() => {
        useDownloadImage.setState({ withSides: false })
        void downloadDesignImage()
      }}
      className="inline-flex size-11 items-center justify-center rounded-full border border-flv-line bg-white/95 text-flv-ink shadow-sm hover:text-flv-accent disabled:opacity-50"
    >
      <Download aria-hidden className="size-4" />
    </button>
  )
}
