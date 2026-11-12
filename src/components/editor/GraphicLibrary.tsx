import { useId, useMemo, useState } from 'react'

import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import {
  GRAPHIC_ASSETS,
  GRAPHIC_CATEGORIES,
  searchGraphics,
  type GraphicCategory,
} from '../../lib/graphics-library'
import { decodeLayerImage } from '../../lib/layer-images'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const CATEGORY_CHIPS: { id: GraphicCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  ...GRAPHIC_CATEGORIES.filter((category) => GRAPHIC_ASSETS.some((asset) => asset.category === category.id)),
]

export function GraphicLibrary() {
  const addGraphic = useEditorStore((state) => state.addGraphic)
  const [category, setCategory] = useState<GraphicCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const searchId = useId()
  const assets = useMemo(() => searchGraphics({ query, category }), [query, category])
  const trimmed = query.trim()

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{FLV_COPY.suggestionsTitle}</p>
      <p className={chromeMutedClass()}>{FLV_COPY.suggestionsApply}</p>
      {decodeError ? (
        <p className="font-body text-sm text-flv-accent" role="status">
          {decodeError}
        </p>
      ) : null}
      <label className="sr-only" htmlFor={searchId}>
        Search graphics
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        placeholder="Search: rose, skull, stars…"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
        className="min-h-11 w-full border border-flv-line bg-flv-paper px-3 font-body text-sm text-flv-ink placeholder:text-flv-muted focus:border-flv-accent"
      />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Graphic categories">
        {CATEGORY_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-pressed={category === chip.id}
            onClick={() => {
              setCategory(chip.id)
            }}
            className={cn('min-h-11 shrink-0 rounded-full border px-3 whitespace-nowrap', chromeTextClass(), {
              'border-flv-accent text-flv-accent': category === chip.id,
              'border-flv-line text-flv-muted hover:text-flv-accent': category !== chip.id,
            })}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {assets.length === 1 ? '1 graphic' : `${assets.length} graphics`}
      </p>
      {assets.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border border-dashed border-flv-line p-3">
          <p className={chromeMutedClass()}>
            {trimmed ? `No graphics match “${trimmed}”.` : 'No graphics here yet.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setCategory('all')
            }}
            className={cn('min-h-11 border border-flv-line px-3 hover:border-flv-accent hover:text-flv-accent', chromeTextClass())}
          >
            Show all graphics
          </button>
        </div>
      ) : (
        <ul className="grid max-h-[min(30rem,60vh)] grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 overflow-y-auto pr-1">
          {assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                title={asset.tags.length > 0 ? `${asset.label}: ${asset.tags.join(', ')}` : asset.label}
                onClick={() => {
                  setDecodeError(null)
                  addGraphic({ src: asset.src })
                  void decodeLayerImage({ src: asset.src }).then((buffer) => {
                    if (!buffer) {
                      setDecodeError(
                        `${asset.label} could not load onto the cloth. Try another mark.`,
                      )
                    }
                  })
                }}
                className="flex min-h-24 w-full flex-col items-center justify-center gap-2 border border-flv-line bg-flv-paper p-2 hover:border-flv-accent"
              >
                <img
                  src={asset.src}
                  alt=""
                  width={96}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="h-14 w-full object-contain"
                />
                <span className="text-center font-body text-xs leading-tight font-medium text-flv-ink">
                  {asset.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
