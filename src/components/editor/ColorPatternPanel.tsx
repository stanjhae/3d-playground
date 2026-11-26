import { MOTIF_IDS, MOTIF_LABELS, type MotifId, isMotifId, motifInk } from '../../lib/base-motifs'
import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { Swatch } from '../ui/Swatch'
import { cn } from '../../lib/cn'
import { isCanonicalGarment } from '../../lib/concept-flags'
import {
  BASE_FINISH_PRESETS,
  useEditorStore,
  type BasePatternId,
} from '../../lib/editor-store'
import { getFabricById } from '../../lib/fabrics'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import { INK_COLORS } from '../../lib/paint-colors'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'
import { FabricGrid, GarmentMaterialHint } from './FabricChooser'
import { SurfaceChooser } from './SurfaceChooser'

const PATTERN_OPTIONS: { id: BasePatternId; label: string }[] = [
  { id: 'solid', label: HOUSE_COPY.solid },
  { id: 'stripe', label: HOUSE_COPY.stripe },
  { id: 'check', label: HOUSE_COPY.check },
  { id: 'gradient', label: HOUSE_COPY.gradient },
]

/** More patterns for template-built garments (tester, 22 Nov). */
const MOTIF_OPTIONS: { id: BasePatternId; label: string }[] = MOTIF_IDS.map((id) => ({ id, label: MOTIF_LABELS[id] }))

/** A small picture of each base pattern, so the choice reads without words. */
function patternPreview({ id }: { id: BasePatternId }) {
  const ink = '#c9c4ba'

  if (id === 'stripe') {
    return { backgroundImage: `repeating-linear-gradient(90deg, ${ink} 0 4px, transparent 4px 10px)` }
  }

  if (id === 'check') {
    return {
      backgroundImage: `repeating-linear-gradient(0deg, ${ink}99 0 5px, transparent 5px 10px), repeating-linear-gradient(90deg, ${ink}99 0 5px, transparent 5px 10px)`,
    }
  }

  if (id === 'gradient') {
    return { backgroundImage: `linear-gradient(90deg, white, ${ink})` }
  }

  if (isMotifId(id)) {
    return { backgroundImage: `url(${motifTile({ motif: id, ink })})`, backgroundSize: '24px 24px' }
  }

  return { backgroundColor: '#f1efea' }
}

const motifTiles = new Map<string, string>()

/** A 48px tile of a motif, drawn by the same rule as the garment, as a data URL. */
function motifTile({ motif, ink }: { motif: MotifId; ink: string }) {
  const cached = motifTiles.get(motif)

  if (cached || typeof document === 'undefined') {
    return cached ?? ''
  }

  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')

  if (!context) {
    return ''
  }

  context.fillStyle = '#f1efea'
  context.fillRect(0, 0, size, size)
  context.fillStyle = ink
  // One repeat across the tile: two bands, so 24px a band.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (motifInk({ motif, x: x / 24, y: y / 24 })) {
        context.fillRect(x, y, 1, 1)
      }
    }
  }

  const url = canvas.toDataURL()
  motifTiles.set(motif, url)
  return url
}

function finishLacksRealMap({ fabricId }: { fabricId: string }) {
  const fabric = getFabricById({ id: fabricId })
  return !fabric?.mapId
}

export function ColorPatternPanel() {
  const garmentId = useEditorStore((state) => state.garmentId)
  // Canonical garments have Solid/Stripes/Check bases and a saved fabric.
  const v2Tee = isCanonicalGarment({ garmentId })
  const basePatternId = useEditorStore((state) => state.basePatternId)
  const baseFinishId = useEditorStore((state) => state.baseFinishId)
  const applyBaseColor = useEditorStore((state) => state.applyBaseColor)
  const setBasePattern = useEditorStore((state) => state.setBasePattern)
  const setBaseFinish = useEditorStore((state) => state.setBaseFinish)
  const applyFabric = useEditorStore((state) => state.applyFabric)
  const fabricId = useEditorStore((state) => state.fabricId)
  const overrides = useEditorStore((state) => state.overrides)
  const baseFabricId = useEditorStore((state) => state.baseFabricId)
  const finish = BASE_FINISH_PRESETS.find((entry) => entry.id === baseFinishId)
  // A canonical garment's cloth is the document's (writer W).
  const clothFabricId = v2Tee ? baseFabricId : fabricId
  const activeFabric =
    getFabricById({ id: clothFabricId ?? finish?.fabricId ?? 'cotton' }) ??
    getFabricById({ id: 'cotton' })
  const activeColor =
    overrides.find((entry) => entry.meshName === 'body')?.color ??
    activeFabric?.color
  const conceptFinishes = BASE_FINISH_PRESETS.filter((entry) =>
    finishLacksRealMap({ fabricId: entry.fabricId }),
  )

  return (
    <aside className={cn(railFrameClass(), 'gap-4 lg:max-w-80')}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.baseColor}</p>
      <div className="grid grid-cols-4 gap-2">
        {INK_COLORS.map((ink) => (
          <Swatch
            key={ink.id}
            name={ink.name}
            color={ink.value}
            selected={activeColor?.toLowerCase() === ink.value.toLowerCase()}
            onClick={() => {
              applyBaseColor({ color: ink.value })
            }}
          />
        ))}
      </div>
      {activeColor ? (
        <div className="flex items-center gap-3 rounded-xl border border-flv-line p-3">
          <span
            aria-hidden
            className="size-10 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: activeColor }}
          />
          <p className="flex flex-col font-body text-sm text-flv-ink">
            {INK_COLORS.find((ink) => ink.value.toLowerCase() === activeColor.toLowerCase())?.name ??
              (activeColor.toLowerCase() === activeFabric?.color.toLowerCase() ? 'Natural' : 'Custom colour')}
            <span className="text-xs text-flv-muted uppercase">{activeColor}</span>
          </p>
        </div>
      ) : null}
      <p className={cn(chromeKickerClass(), 'border-t border-flv-line pt-4')}>{HOUSE_COPY.patternFill}</p>
      <div className={cn('grid gap-2', v2Tee ? 'grid-cols-3' : 'grid-cols-2')}>
        {[...PATTERN_OPTIONS, ...(v2Tee ? MOTIF_OPTIONS : [])].filter(
          (pattern) => !v2Tee || pattern.id !== 'gradient',
        ).map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            aria-pressed={basePatternId === pattern.id}
            onClick={() => {
              setBasePattern({ patternId: pattern.id })
            }}
            className={cn(
              'relative flex min-h-14 items-end rounded-xl border px-2 py-2',
              chromeTextClass(),
              {
                'border-flv-accent text-flv-accent':
                  basePatternId === pattern.id,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  basePatternId !== pattern.id,
              },
            )}
          >
            {basePatternId === pattern.id ? (
              <span className="absolute top-1 right-1 text-flv-accent">✓</span>
            ) : null}
            <span className="flex w-full flex-col gap-1.5">
              <span aria-hidden className="h-8 w-full rounded-md border border-flv-line" style={patternPreview({ id: pattern.id })} />
              {pattern.label}
            </span>
          </button>
        ))}
      </div>
      {v2Tee ? (
        <>
          {/* Each part says what it changes (tester, 22 Nov: what does Surface do?). */}
          <fieldset className="flex flex-col gap-2 border-t border-flv-line pt-4" data-testid="fabric-chooser">
            <legend className={cn(chromeKickerClass(), 'float-left w-full')}>{HOUSE_COPY.fabric}</legend>
            <p className="font-body text-xs text-flv-muted">{HOUSE_COPY.fabricHint}</p>
            <FabricGrid />
          </fieldset>
          <SurfaceChooser />
          <GarmentMaterialHint />
        </>
      ) : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={chromeKickerClass()}>{HOUSE_COPY.finish}</p>
        {conceptFinishes.length > 0 ? <ConceptPreviewBadge /> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {BASE_FINISH_PRESETS.map((finishOption) => (
          <button
            key={finishOption.id}
            type="button"
            aria-pressed={baseFinishId === finishOption.id}
            onClick={() => {
              setBaseFinish({ finishId: finishOption.id })
            }}
            className={cn(
              'relative flex min-h-12 items-end rounded-xl border px-2 py-2',
              chromeTextClass(),
              {
                'border-flv-accent text-flv-accent':
                  baseFinishId === finishOption.id,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  baseFinishId !== finishOption.id,
              },
            )}
          >
            {baseFinishId === finishOption.id ? (
              <span className="absolute top-1 right-1 text-flv-accent">✓</span>
            ) : null}
            {finishOption.label}
          </button>
        ))}
      </div>
      <SurfaceChooser />
      {activeFabric ? (
        <div className="flex flex-col gap-2 rounded-xl border border-flv-line p-3">
          <div
            className="aspect-[5/3] rounded-lg border border-flv-line"
            style={{ backgroundColor: activeFabric.color }}
          />
          <p className={chromeKickerClass()}>{FLV_COPY.colorMaterial}</p>
          <p className="font-body text-sm text-flv-ink">{activeFabric.name}</p>
          <ul className="flex flex-col gap-1 font-body text-xs text-flv-muted">
            <li>Roughness {activeFabric.roughness.toFixed(2)}</li>
            <li>Metalness {activeFabric.metalness.toFixed(2)}</li>
            {activeFabric.mapId ? <li>Map {activeFabric.mapId}</li> : null}
          </ul>
        </div>
      ) : null}
      </>
      )}
      {clothFabricId ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              // A canonical cloth keeps the chosen colour: this puts its own back.
              if (v2Tee) {
                applyBaseColor({ color: activeFabric?.color ?? '#f3efe6' })
                return
              }

              applyFabric({ fabricId: clothFabricId, colorId: clothFabricId })
            }}
            className={cn(
              'min-h-11 text-flv-muted hover:text-flv-accent',
              chromeTextClass(),
            )}
          >
            {HOUSE_COPY.cloth}
          </button>
        </div>
      ) : null}
    </aside>
  )
}
