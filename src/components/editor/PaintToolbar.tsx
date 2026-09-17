import { useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { selectedTextLayer } from '../../lib/layer-hit'
import { isSafeLayerSrc } from '../../lib/look-thumbnail'
import { INK_COLORS, INK_WIDTHS, TYPE_SIZES } from '../../lib/paint-colors'

export function PaintToolbar() {
  const paintTool = useEditorStore((state) => state.paintTool)
  const paintColor = useEditorStore((state) => state.paintColor)
  const paintWidth = useEditorStore((state) => state.paintWidth)
  const undoCount = useEditorStore((state) => state.undoCount)
  const redoCount = useEditorStore((state) => state.redoCount)
  const setPaintTool = useEditorStore((state) => state.setPaintTool)
  const setPaintColor = useEditorStore((state) => state.setPaintColor)
  const setPaintWidth = useEditorStore((state) => state.setPaintWidth)
  const undoLast = useEditorStore((state) => state.undoLast)
  const redoLast = useEditorStore((state) => state.redoLast)
  const clearInk = useEditorStore((state) => state.clearInk)
  const addGraphic = useEditorStore((state) => state.addGraphic)
  const textFace = useEditorStore((state) => state.textFace)
  const textScale = useEditorStore((state) => state.textScale)
  const typeDraft = useEditorStore((state) => state.typeDraft)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const documentState = useEditorStore((state) => state.document)
  const setTextFace = useEditorStore((state) => state.setTextFace)
  const setTextScale = useEditorStore((state) => state.setTextScale)
  const setTypeDraft = useEditorStore((state) => state.setTypeDraft)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [artworkError, setArtworkError] = useState<string | null>(null)
  const selectedWord = selectedTextLayer({
    document: documentState,
    selectedLayerId,
  })

  return (
    <aside className="flex w-full flex-col gap-3 border border-atelier-line bg-atelier/92 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setPaintTool({ paintTool: 'brush' })
          }}
          className={cn('min-h-11 font-display text-xs tracking-[0.16em] uppercase', {
            'text-brass': paintTool === 'brush',
            'text-ivory-muted hover:text-brass': paintTool !== 'brush',
          })}
        >
          {HOUSE_COPY.brush}
        </button>
        <button
          type="button"
          onClick={() => {
            setPaintTool({ paintTool: 'eraser' })
          }}
          className={cn('min-h-11 font-display text-xs tracking-[0.16em] uppercase', {
            'text-brass': paintTool === 'eraser',
            'text-ivory-muted hover:text-brass': paintTool !== 'eraser',
          })}
        >
          {HOUSE_COPY.erase}
        </button>
        <button
          type="button"
          disabled={undoCount === 0}
          onClick={() => {
            undoLast()
          }}
          className="min-h-11 font-display text-xs tracking-[0.16em] text-ivory-muted uppercase hover:text-brass disabled:opacity-30"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={redoCount === 0}
          onClick={() => {
            redoLast()
          }}
          className="min-h-11 font-display text-xs tracking-[0.16em] text-ivory-muted uppercase hover:text-brass disabled:opacity-30"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => {
            clearInk()
          }}
          className="min-h-11 font-display text-xs tracking-[0.16em] text-ivory-muted uppercase hover:text-brass"
        >
          {HOUSE_COPY.clearInk}
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {INK_COLORS.map((color) => (
          <li key={color.id}>
            <button
              type="button"
              aria-label={color.name}
              onClick={() => {
                setPaintColor({ paintColor: color.value })
                setPaintTool({ paintTool: 'brush' })
              }}
              className={cn('size-8 border', {
                'border-brass': paintColor === color.value,
                'border-atelier-line': paintColor !== color.value,
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
            onClick={() => {
              setPaintWidth({ paintWidth: width })
            }}
            className={cn(
              'min-h-11 flex-1 border font-display text-[10px] tracking-[0.14em] uppercase',
              {
                'border-brass text-brass': paintWidth === width,
                'border-atelier-line text-ivory-muted': paintWidth !== width,
              },
            )}
          >
            {width === INK_WIDTHS[0] ? 'Fine' : width === INK_WIDTHS[2] ? 'Bold' : 'Line'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''

            if (!file) {
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
          onClick={() => {
            fileRef.current?.click()
          }}
          className="min-h-11 border border-atelier-line px-3 font-display text-xs tracking-[0.16em] text-ivory uppercase hover:text-brass"
        >
          {HOUSE_COPY.artwork}
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="sr-only">{HOUSE_COPY.type}</span>
          <input
            value={typeDraft}
            onChange={(event) => {
              setTypeDraft({ typeDraft: event.target.value })
            }}
            placeholder={HOUSE_COPY.type}
            className="min-h-11 min-w-0 flex-1 border border-atelier-line bg-atelier px-3 text-ivory"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setPaintTool({ paintTool: 'type' })
          }}
          className={cn(
            'min-h-11 border px-3 font-display text-xs tracking-[0.16em] uppercase',
            {
              'border-brass text-brass': paintTool === 'type',
              'border-atelier-line text-ivory hover:text-brass':
                paintTool !== 'type',
            },
          )}
        >
          {HOUSE_COPY.type}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['display', 'sans'] as const).map((face) => (
          <button
            key={face}
            type="button"
            onClick={() => {
              setTextFace({ textFace: face })
              if (selectedWord) {
                updateLayer({
                  layerId: selectedWord.id,
                  patch: { face },
                })
              }
            }}
            className={cn(
              'min-h-11 flex-1 border font-display text-[10px] tracking-[0.14em] uppercase',
              {
                'border-brass text-brass': textFace === face,
                'border-atelier-line text-ivory-muted': textFace !== face,
              },
            )}
          >
            {face === 'display' ? HOUSE_COPY.displayFace : HOUSE_COPY.sansFace}
          </button>
        ))}
        {TYPE_SIZES.map((size) => (
          <button
            key={size.id}
            type="button"
            onClick={() => {
              setTextScale({ textScale: size.scale })
              if (selectedWord) {
                updateLayer({
                  layerId: selectedWord.id,
                  patch: { scale: size.scale },
                })
              }
            }}
            className={cn(
              'min-h-11 flex-1 border font-display text-[10px] tracking-[0.14em] uppercase',
              {
                'border-brass text-brass': textScale === size.scale,
                'border-atelier-line text-ivory-muted': textScale !== size.scale,
              },
            )}
          >
            {size.label}
          </button>
        ))}
      </div>
      {artworkError ? (
        <p className="text-sm text-ivory-muted">{artworkError}</p>
      ) : null}
    </aside>
  )
}
