import { useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import { isCanonicalGarment } from '../../lib/concept-flags'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { garmentPanels } from '../../lib/garments'
import { HOUSE_COPY } from '../../lib/house-copy'
import { selectedTextLayer } from '../../lib/layer-hit'
import { isSafeLayerSrc } from '../../lib/look-thumbnail'
import { INK_COLORS, INK_WIDTHS, TYPE_SIZES } from '../../lib/paint-colors'
import {
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'
import { uploadForStudio } from '../../lib/uploaded-images'
import { ImportNotice } from './ImportNotice'
import { LimitMeter } from './LimitMeter'

function inkWidthLabel({ width }: { width: number }) {
  if (width === INK_WIDTHS[0]) {
    return HOUSE_COPY.fine
  }

  if (width === INK_WIDTHS[2]) {
    return HOUSE_COPY.bold
  }

  return HOUSE_COPY.line
}

function toolButtonClass({ selected }: { selected: boolean }) {
  return cn('min-h-11 border px-3', chromeTextClass(), {
    'border-flv-accent text-flv-accent': selected,
    'border-flv-line text-flv-muted hover:text-flv-accent': !selected,
  })
}

export function PaintToolbar({
  tools = 'all',
}: {
  tools?: 'all' | 'ink' | 'placeables'
}) {
  const paintTool = useEditorStore((state) => state.paintTool)
  const paintColor = useEditorStore((state) => state.paintColor)
  const paintWidth = useEditorStore((state) => state.paintWidth)
  const paintOpacity = useEditorStore((state) => state.paintOpacity)
  const paintHardness = useEditorStore((state) => state.paintHardness)
  const setPaintTool = useEditorStore((state) => state.setPaintTool)
  const setPaintColor = useEditorStore((state) => state.setPaintColor)
  const setPaintWidth = useEditorStore((state) => state.setPaintWidth)
  const setPaintOpacity = useEditorStore((state) => state.setPaintOpacity)
  const setPaintHardness = useEditorStore((state) => state.setPaintHardness)
  const clearInk = useEditorStore((state) => state.clearInk)
  const paintPanel = useEditorStore((state) => state.paintPanel)
  const garmentId = useEditorStore((state) => state.garmentId)
  // Clearing is confirmed and limited to one panel (#159).
  const [confirmingClear, setConfirmingClear] = useState(false)
  const panelLabel =
    garmentPanels({ garmentId }).find((panel) => panel.id === paintPanel)?.label ?? HOUSE_COPY.front
  const addGraphic = useEditorStore((state) => state.addGraphic)
  const addUploadedImage = useEditorStore((state) => state.addUploadedImage)
  const addPattern = useEditorStore((state) => state.addPattern)
  const v2Tee = useEditorStore((state) => isCanonicalGarment({ garmentId: state.garmentId }))
  const textFace = useEditorStore((state) => state.textFace)
  const textScale = useEditorStore((state) => state.textScale)
  const typeDraft = useEditorStore((state) => state.typeDraft)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const documentState = useEditorStore((state) => state.document)
  const setTextFace = useEditorStore((state) => state.setTextFace)
  const setTextScale = useEditorStore((state) => state.setTextScale)
  const setTypeDraft = useEditorStore((state) => state.setTypeDraft)
  const addText = useEditorStore((state) => state.addText)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [artworkError, setArtworkError] = useState<string | null>(null)
  const cloudDesign = useEditorStore((state) => state.cloud !== null)
  const [uploading, setUploading] = useState(false)
  const selectedWord = selectedTextLayer({
    document: documentState,
    selectedLayerId,
  })
  const showInk = tools === 'all' || tools === 'ink'
  const showPlaceables = tools === 'all' || tools === 'placeables'

  return (
    <aside className={railFrameClass()}>
      <ImportNotice />
      <LimitMeter />
      {showInk ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPaintTool({ paintTool: 'brush' })
              }}
              aria-pressed={paintTool === 'brush'}
              className={toolButtonClass({ selected: paintTool === 'brush' })}
            >
              {HOUSE_COPY.brush}
            </button>
            <button
              type="button"
              onClick={() => {
                setPaintTool({ paintTool: 'eraser' })
              }}
              aria-pressed={paintTool === 'eraser'}
              className={toolButtonClass({ selected: paintTool === 'eraser' })}
            >
              {HOUSE_COPY.erase}
            </button>
            {v2Tee ? null : (
            <button
              type="button"
              onClick={() => {
                setPaintTool({ paintTool: 'fill' })
              }}
              aria-pressed={paintTool === 'fill'}
              className={toolButtonClass({ selected: paintTool === 'fill' })}
            >
              {FLV_COPY.fillTool}
            </button>
            )}
            <button
              type="button"
              aria-expanded={confirmingClear}
              onClick={() => setConfirmingClear(true)}
              className={cn(
                'min-h-11 text-flv-muted hover:text-flv-accent',
                chromeTextClass(),
              )}
            >
              {HOUSE_COPY.clearInk}
            </button>
          </div>
          {confirmingClear ? (
            <div
              role="group"
              aria-label={`Clear ink on the ${panelLabel.toLowerCase()}`}
              className="flex flex-wrap items-center gap-2 border border-flv-line p-2"
            >
              <p className={cn('flex-1', chromeMutedClass())}>
                Clear all ink on the {panelLabel.toLowerCase()}? Words, graphics and other panels stay. You can undo this.
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingClear(false)}
                className={toolButtonClass({ selected: false })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearInk({ panel: paintPanel })
                  setConfirmingClear(false)
                }}
                className={toolButtonClass({ selected: true })}
              >
                Clear {panelLabel.toLowerCase()}
              </button>
            </div>
          ) : null}
          <ul className="flex flex-wrap gap-2">
            {INK_COLORS.map((color) => (
              <li key={color.id}>
                <button
                  type="button"
                  aria-label={color.name}
                  aria-pressed={paintColor === color.value}
                  onClick={() => {
                    setPaintColor({ paintColor: color.value })
                    setPaintTool({ paintTool: 'brush' })
                  }}
                  className={cn('size-11 border', {
                    'border-flv-accent': paintColor === color.value,
                    'border-flv-line': paintColor !== color.value,
                  })}
                  style={{ backgroundColor: color.value }}
                />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {INK_WIDTHS.map((width) => (
              <button
                key={width}
                type="button"
                aria-pressed={paintWidth === width}
                onClick={() => {
                  setPaintWidth({ paintWidth: width })
                }}
                className={cn('min-h-11 flex-1 border', chromeTextClass(), {
                  'border-flv-accent text-flv-accent': paintWidth === width,
                  'border-flv-line text-flv-muted': paintWidth !== width,
                })}
              >
                {inkWidthLabel({ width })}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className={chromeMutedClass()}>{FLV_COPY.brushSize}</span>
            <input
              type="range"
              min={0.01}
              max={0.06}
              step={0.002}
              value={paintWidth}
              onChange={(event) => {
                setPaintWidth({
                  paintWidth: Number.parseFloat(event.target.value),
                })
              }}
              className="w-full accent-flv-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={chromeMutedClass()}>{FLV_COPY.brushOpacity}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={paintOpacity}
              onChange={(event) => {
                setPaintOpacity({
                  paintOpacity: Number.parseFloat(event.target.value),
                })
              }}
              className="w-full accent-flv-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={chromeMutedClass()}>{FLV_COPY.brushHardness}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={paintHardness}
              onChange={(event) => {
                setPaintHardness({
                  paintHardness: Number.parseFloat(event.target.value),
                })
              }}
              className="w-full accent-flv-accent"
            />
          </label>
        </>
      ) : null}
      {showPlaceables ? (
        <>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={
                cloudDesign
                  ? 'image/png,image/jpeg'
                  : 'image/png,image/jpeg,image/webp,image/gif'
              }
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''

                if (!file) {
                  return
                }

                // A cloud design stores only finalized uploads (S01 #170):
                // upload first, then place the ready asset.
                if (cloudDesign) {
                  setArtworkError(null)
                  setUploading(true)
                  void uploadForStudio({ file }).then((result) => {
                    setUploading(false)

                    if (result.ok) {
                      addUploadedImage(result.data)
                    } else if (result.code !== 'account-changed') {
                      setArtworkError(`Upload failed: ${result.message}`)
                    }
                  })
                  return
                }

                if (file.size > 1_200_000) {
                  setArtworkError(HOUSE_COPY.artworkHeavy)
                  return
                }

                const reader = new FileReader()
                reader.onload = () => {
                  if (typeof reader.result !== 'string') {
                    return
                  }

                  if (!isSafeLayerSrc({ src: reader.result })) {
                    setArtworkError(HOUSE_COPY.artworkHeavy)
                    return
                  }

                  setArtworkError(null)
                  addGraphic({ src: reader.result })
                }
                reader.readAsDataURL(file)
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                fileRef.current?.click()
              }}
              className={cn(
                'min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent',
                chromeTextClass(),
              )}
            >
              {uploading ? 'Uploading…' : HOUSE_COPY.artwork}
            </button>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="sr-only">{HOUSE_COPY.type}</span>
              <input
                value={typeDraft}
                onChange={(event) => {
                  setTypeDraft({ typeDraft: event.target.value })
                }}
                onKeyDown={(event) => {
                  // Keyboard placement (#163): the word lands on the active panel.
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing || !typeDraft.trim()) {
                    return
                  }

                  event.preventDefault()
                  addText({ content: typeDraft, face: textFace, scale: textScale })
                }}
                placeholder={HOUSE_COPY.type}
                className="min-h-11 min-w-0 flex-1 border border-flv-line bg-flv-paper px-3 font-body text-sm text-flv-ink"
              />
            </label>
            {v2Tee ? null : (
            <>
            <button
              type="button"
              onClick={() => {
                addPattern({ patternId: 'stripe' })
              }}
              className={cn(
                'min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent',
                chromeTextClass(),
              )}
            >
              {HOUSE_COPY.stripe}
            </button>
            <button
              type="button"
              onClick={() => {
                addPattern({ patternId: 'check' })
              }}
              className={cn(
                'min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent',
                chromeTextClass(),
              )}
            >
              {HOUSE_COPY.check}
            </button>
            </>
            )}
            <button
              type="button"
              onClick={() => {
                setPaintTool({ paintTool: 'type' })
              }}
              aria-pressed={paintTool === 'type'}
              className={toolButtonClass({ selected: paintTool === 'type' })}
            >
              {HOUSE_COPY.type}
            </button>
          </div>
          <p className="font-body text-sm text-flv-muted">{HOUSE_COPY.typeHint}</p>
          <div className="flex flex-wrap gap-2">
            {(['display', 'sans'] as const).map((face) => (
              <button
                key={face}
                type="button"
                aria-pressed={textFace === face}
                onClick={() => {
                  setTextFace({ textFace: face })
                  if (selectedWord) {
                    updateLayer({
                      layerId: selectedWord.id,
                      patch: { face },
                    })
                  }
                }}
                className={cn('min-h-11 flex-1 border', chromeTextClass(), {
                  'border-flv-accent text-flv-accent': textFace === face,
                  'border-flv-line text-flv-muted': textFace !== face,
                })}
              >
                {face === 'display'
                  ? HOUSE_COPY.displayFace
                  : HOUSE_COPY.sansFace}
              </button>
            ))}
            {TYPE_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                aria-pressed={textScale === size.scale}
                onClick={() => {
                  setTextScale({ textScale: size.scale })
                  if (selectedWord) {
                    updateLayer({
                      layerId: selectedWord.id,
                      patch: { scale: size.scale },
                    })
                  }
                }}
                className={cn('min-h-11 flex-1 border', chromeTextClass(), {
                  'border-flv-accent text-flv-accent': textScale === size.scale,
                  'border-flv-line text-flv-muted': textScale !== size.scale,
                })}
              >
                {size.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {uploading ? (
        <p className="font-body text-sm text-flv-muted" role="status">
          Uploading your image. It is placed once the upload is checked.
        </p>
      ) : null}
      {artworkError ? (
        <p className="font-body text-sm text-flv-accent" role="alert">{artworkError}</p>
      ) : null}
    </aside>
  )
}
