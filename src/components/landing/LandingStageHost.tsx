import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '../../lib/cn'
import type { AvatarMeasurements } from '../../lib/avatar-geometry'
import type { DesignDocument, HemId, NeckId, SleeveId } from '../../lib/design-document'
import { listDesigns } from '../../lib/designs-api'
import type { GarmentId, Design } from '../../lib/design-schema'
import { BASE_FINISH_PRESETS } from '../../lib/editor-store'
import { getFabricById, listFabrics } from '../../lib/fabrics'
import { FLV_COPY } from '../../lib/flv-copy'
import { getGarment } from '../../lib/garments'
import { GRAPHIC_ASSETS } from '../../lib/graphics-library'
import { listAvatars } from '../../lib/avatars'
import {
  addLandingStroke,
  applyLandingPattern,
  CANNED_STILLS,
  GARMENT_CATEGORIES,
  LANDING_CAMERA_VIEWS,
  LANDING_PATTERN_OPTIONS,
  LANDING_TEXTURE_OPTIONS,
  latestLandingGraphicId,
  stampLandingGraphic,
  updateLandingGraphicTransform,
  garmentCategory,
  listGarmentsByCategory,
  type GarmentCategoryId,
  type LandingCameraView,
  type LandingTextureId,
  type StudioEnvMode,
} from '../../lib/landing-demo'
import { writeLandingHandoff } from '../../lib/landing-handoff'
import {
  isCreateLandingStage,
  LANDING_STAGE_IDS,
  landingStageChip,
  landingStageLead,
  landingStageTitle,
  type LandingStageId,
} from '../../lib/landing-stages'
import { INK_COLORS } from '../../lib/paint-colors'
import { isSafeThumbnail } from '../../lib/look-thumbnail'
import { rankDesigns } from '../../lib/rank-designs'

type DocumentChangeHandler = ({
  apply,
}: {
  apply: (previous: DesignDocument) => DesignDocument
}) => void

export function LandingStageHost({
  activeStage,
  garmentId,
  clothColor,
  textureId,
  neck,
  hem,
  sleeve,
  document: designDocument,
  measurements,
  envMode,
  onStageChange,
  onGarmentChange,
  onColorChange,
  onTextureChange,
  onNeckChange,
  onHemChange,
  onSleeveChange,
  onDocumentChange,
  onMeasurementsChange,
  onEnvModeChange,
  onCameraViewChange,
}: {
  activeStage: LandingStageId
  garmentId: GarmentId
  clothColor: string
  textureId: LandingTextureId
  neck: NeckId
  hem: HemId
  sleeve: SleeveId
  document: DesignDocument
  measurements: AvatarMeasurements
  envMode: StudioEnvMode
  onStageChange: ({ stage }: { stage: LandingStageId }) => void
  onGarmentChange: ({ garmentId }: { garmentId: GarmentId }) => void
  onColorChange: ({ color }: { color: string }) => void
  onTextureChange: ({ textureId }: { textureId: LandingTextureId }) => void
  onNeckChange: ({ neck }: { neck: NeckId }) => void
  onHemChange: ({ hem }: { hem: HemId }) => void
  onSleeveChange: ({ sleeve }: { sleeve: SleeveId }) => void
  onDocumentChange: DocumentChangeHandler
  onMeasurementsChange: ({
    measurements,
  }: {
    measurements: AvatarMeasurements
  }) => void
  onEnvModeChange: ({ envMode }: { envMode: StudioEnvMode }) => void
  onCameraViewChange: ({
    cameraView,
  }: {
    cameraView: LandingCameraView
  }) => void
}) {
  const title = landingStageTitle({ stage: activeStage })
  const lead = landingStageLead({ stage: activeStage })
  const [category, setCategory] = useState<GarmentCategoryId>(
    garmentCategory({ garmentId }),
  )
  const [patternId, setPatternId] = useState('solid')
  const [finishId, setFinishId] = useState<
    (typeof BASE_FINISH_PRESETS)[number]['id']
  >(BASE_FINISH_PRESETS[0]!.id)
  const [avatarId, setAvatarId] = useState(listAvatars()[0]?.id ?? '')
  const [boardLooks, setBoardLooks] = useState<Design[]>([])
  const garment = getGarment({ garmentId })
  const finish = BASE_FINISH_PRESETS.find((entry) => entry.id === finishId)
  const activeFabric =
    getFabricById({ id: finish?.fabricId ?? 'cotton' }) ?? listFabrics()[0]
  const avatars = listAvatars()
  const selectedAvatar =
    avatars.find((avatar) => avatar.id === avatarId) ?? avatars[0]

  useEffect(() => {
    setCategory(garmentCategory({ garmentId }))
  }, [garmentId])

  useEffect(() => {
    let cancelled = false

    void listDesigns()
      .then((designs) => {
        if (!cancelled) {
          setBoardLooks(rankDesigns({ designs }).slice(0, 5))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBoardLooks([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  function persistHandoff() {
    writeLandingHandoff({
      garmentId,
      document: designDocument,
      color: clothColor,
      neck,
      hem,
      sleeve,
    })
  }

  return (
    <section
      id="product-stages"
      className="flex flex-col gap-5 border-b border-flv-line px-6 py-10 sm:px-10"
    >
      <div className="flex flex-wrap gap-2">
        {LANDING_STAGE_IDS.map((stage) => (
          <button
            key={stage}
            type="button"
            aria-pressed={activeStage === stage}
            onClick={() => {
              onStageChange({ stage })
            }}
            className={cn(
              'min-h-9 rounded-full border px-3 font-body text-xs tracking-[0.08em] uppercase',
              {
                'border-flv-accent bg-flv-accent/5 text-flv-accent':
                  activeStage === stage,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  activeStage !== stage,
              },
            )}
          >
            {landingStageChip({ stage })}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl text-flv-ink">{title}</h2>
        <p className="max-w-2xl font-body text-sm text-flv-muted">{lead}</p>
        <p className="font-body text-xs text-flv-muted">
          Live 3D updates in the hero stage above.
        </p>
      </div>
      <div key={activeStage} className="flv-stage-enter">
        {activeStage === 'select' ? (
          <SelectDemo
            category={category}
            garmentId={garmentId}
            garmentLabel={garment.label}
            garmentCredit={garment.credit?.label}
            onCategoryChange={({ category: next }) => {
              setCategory(next)
              const first = listGarmentsByCategory({ category: next })[0]
              if (first) {
                onGarmentChange({ garmentId: first.id })
              }
            }}
            onGarmentChange={onGarmentChange}
          />
        ) : null}
        {activeStage === 'fit' ? (
          <div className="flv-panel flex flex-wrap gap-2 p-4">
            <FitChip
              label="Crew"
              pressed={neck === 'crew'}
              onPress={() => {
                onNeckChange({ neck: 'crew' })
              }}
            />
            <FitChip
              label="V"
              pressed={neck === 'v'}
              onPress={() => {
                onNeckChange({ neck: 'v' })
              }}
            />
            <FitChip
              label="Crop"
              pressed={hem === 'crop'}
              onPress={() => {
                onHemChange({ hem: 'crop' })
              }}
            />
            <FitChip
              label="Long hem"
              pressed={hem === 'long'}
              onPress={() => {
                onHemChange({ hem: 'long' })
              }}
            />
            <FitChip
              label="Short sleeve"
              pressed={sleeve === 'short'}
              onPress={() => {
                onSleeveChange({ sleeve: 'short' })
              }}
            />
            <FitChip
              label="Long sleeve"
              pressed={sleeve === 'long'}
              onPress={() => {
                onSleeveChange({ sleeve: 'long' })
              }}
            />
          </div>
        ) : null}
        {activeStage === 'color' ? (
          <ColorDemo
            clothColor={clothColor}
            patternId={patternId}
            textureId={textureId}
            finishId={finishId}
            fabricName={activeFabric?.name ?? 'Cotton'}
            fabricColor={activeFabric?.color ?? '#f3efe6'}
            onColorChange={onColorChange}
            onPatternChange={({ patternId: next }) => {
              setPatternId(next)
              onDocumentChange({
                apply: (previous) =>
                  applyLandingPattern({
                    document: previous,
                    patternId: next as
                      | 'solid'
                      | 'stripe'
                      | 'check'
                      | 'gradient',
                    color: clothColor,
                  }),
              })
            }}
            onTextureChange={onTextureChange}
            onFinishChange={({ finishId: next }) => {
              setFinishId(next as (typeof BASE_FINISH_PRESETS)[number]['id'])
              const nextFinish = BASE_FINISH_PRESETS.find(
                (entry) => entry.id === next,
              )
              const fabric =
                getFabricById({ id: nextFinish?.fabricId ?? 'cotton' }) ??
                listFabrics()[0]
              if (fabric) {
                onColorChange({ color: fabric.color })
              }
            }}
          />
        ) : null}
        {activeStage === 'design' ? (
          <DesignDemo
            document={designDocument}
            onDocumentChange={onDocumentChange}
            onCameraViewChange={onCameraViewChange}
          />
        ) : null}
        {activeStage === 'preview' ? (
          <PreviewDemo
            avatars={avatars}
            avatarId={selectedAvatar?.id ?? ''}
            measurements={measurements}
            envMode={envMode}
            onAvatarChange={({ avatarId: next }) => {
              setAvatarId(next)
              const avatar = avatars.find((entry) => entry.id === next)
              if (avatar) {
                onMeasurementsChange({
                  measurements: {
                    height: avatar.heightCm,
                    chest: avatar.chestCm,
                    waist: avatar.waistCm,
                  },
                })
              }
            }}
            onMeasurementsChange={onMeasurementsChange}
            onEnvModeChange={onEnvModeChange}
          />
        ) : null}
        {activeStage === 'share' ? (
          <ShareDemo
            onBeforeStudioNavigate={() => {
              persistHandoff()
            }}
          />
        ) : null}
        {activeStage === 'vote' ? <CommunityDemo looks={boardLooks} /> : null}
      </div>
      {isCreateLandingStage(activeStage) ? (
        <Link
          to="/create"
          search={{
            step: activeStage,
            garment: garmentId,
            color: clothColor,
            neck,
            hem,
            sleeve,
          }}
          onClick={() => {
            persistHandoff()
          }}
          className="flv-cta inline-flex min-h-12 w-fit items-center px-6 font-body text-xs tracking-[0.12em] uppercase"
        >
          {FLV_COPY.openInStudio} →
        </Link>
      ) : null}
    </section>
  )
}

function SelectDemo({
  category,
  garmentId,
  garmentLabel,
  garmentCredit,
  onCategoryChange,
  onGarmentChange,
}: {
  category: GarmentCategoryId
  garmentId: GarmentId
  garmentLabel: string
  garmentCredit?: string
  onCategoryChange: ({ category }: { category: GarmentCategoryId }) => void
  onGarmentChange: ({ garmentId }: { garmentId: GarmentId }) => void
}) {
  const garments = listGarmentsByCategory({ category })

  return (
    <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)_16rem]">
      <aside className="flv-panel flex flex-col gap-1 p-2">
        {GARMENT_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={category === entry.id}
            onClick={() => {
              onCategoryChange({ category: entry.id })
            }}
            className={cn(
              'flex min-h-11 items-center justify-between rounded-xl px-3 font-body text-xs tracking-[0.08em] uppercase',
              {
                'border border-flv-accent text-flv-accent':
                  category === entry.id,
                'text-flv-muted hover:text-flv-accent': category !== entry.id,
              },
            )}
          >
            {FLV_COPY[entry.labelKey]}
            <span aria-hidden>→</span>
          </button>
        ))}
      </aside>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {garments.length === 0 ? (
          <p className="col-span-full font-body text-sm text-flv-muted">
            No garments in this category yet.
          </p>
        ) : null}
        {garments.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={garmentId === entry.id}
            onClick={() => {
              onGarmentChange({ garmentId: entry.id })
            }}
            className={cn(
              'flv-panel relative flex min-h-28 flex-col items-start justify-end gap-1 p-3 text-left',
              {
                'ring-2 ring-flv-accent': garmentId === entry.id,
              },
            )}
          >
            {garmentId === entry.id ? (
              <span className="absolute top-2 right-2 inline-flex size-5 items-center justify-center rounded-full bg-flv-accent text-[0.6rem] text-white">
                ✓
              </span>
            ) : null}
            <span className="font-body text-xs tracking-[0.08em] text-flv-ink uppercase">
              {entry.label}
            </span>
          </button>
        ))}
      </div>
      <aside className="flv-panel flex flex-col gap-3 p-4">
        <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
          {FLV_COPY.selectDetails}
        </p>
        <h3 className="font-display text-xl text-flv-ink">{garmentLabel}</h3>
        <p className="font-body text-sm text-flv-muted">
          {garmentCredit ?? 'House silhouette with realistic 3D model.'}
        </p>
        <ul className="flex flex-col gap-1 font-body text-xs text-flv-muted">
          <li>Realistic 3D model</li>
          <li>Live preview on landing</li>
          <li>Open in studio to design</li>
        </ul>
      </aside>
    </div>
  )
}

function ColorDemo({
  clothColor,
  patternId,
  textureId,
  finishId,
  fabricName,
  fabricColor,
  onColorChange,
  onPatternChange,
  onTextureChange,
  onFinishChange,
}: {
  clothColor: string
  patternId: string
  textureId: LandingTextureId
  finishId: string
  fabricName: string
  fabricColor: string
  onColorChange: ({ color }: { color: string }) => void
  onPatternChange: ({ patternId }: { patternId: string }) => void
  onTextureChange: ({ textureId }: { textureId: LandingTextureId }) => void
  onFinishChange: ({ finishId }: { finishId: string }) => void
}) {
  const activeInk =
    INK_COLORS.find((ink) => ink.value === clothColor) ?? INK_COLORS[1]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem]">
      <div className="flv-panel flex flex-col gap-3 p-4">
        <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
          Base color
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {INK_COLORS.map((ink) => (
            <button
              key={ink.id}
              type="button"
              aria-label={ink.name}
              aria-pressed={clothColor === ink.value}
              onClick={() => {
                onColorChange({ color: ink.value })
              }}
              className={cn('aspect-square rounded-full border-2', {
                'border-flv-accent': clothColor === ink.value,
                'border-flv-line': clothColor !== ink.value,
              })}
              style={{ backgroundColor: ink.value }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <span
            className="size-10 rounded-full border border-flv-line"
            style={{ backgroundColor: clothColor }}
          />
          <div>
            <p className="font-body text-sm text-flv-ink">{activeInk?.name}</p>
            <p className="font-body text-xs text-flv-muted">{clothColor}</p>
          </div>
        </div>
        <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
          Finish
        </p>
        <div className="flex flex-wrap gap-2">
          {BASE_FINISH_PRESETS.map((finish) => (
            <button
              key={finish.id}
              type="button"
              aria-pressed={finishId === finish.id}
              onClick={() => {
                onFinishChange({ finishId: finish.id })
              }}
              className={cn(
                'min-h-9 rounded-full border px-3 font-body text-xs uppercase',
                {
                  'border-flv-accent text-flv-accent': finishId === finish.id,
                  'border-flv-line text-flv-muted': finishId !== finish.id,
                },
              )}
            >
              {finish.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flv-panel flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
            Pattern
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LANDING_PATTERN_OPTIONS.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                aria-pressed={patternId === pattern.id}
                onClick={() => {
                  onPatternChange({ patternId: pattern.id })
                }}
                className={cn(
                  'relative flex min-h-16 items-end rounded-xl border p-2 font-body text-xs uppercase',
                  {
                    'border-flv-accent text-flv-accent':
                      patternId === pattern.id,
                    'border-flv-line text-flv-muted': patternId !== pattern.id,
                  },
                )}
              >
                {patternId === pattern.id ? (
                  <span className="absolute top-1 right-1 text-flv-accent">
                    ✓
                  </span>
                ) : null}
                {pattern.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
            Texture
          </p>
          <div className="grid grid-cols-3 gap-2">
            {LANDING_TEXTURE_OPTIONS.map((texture) => (
              <button
                key={texture.id}
                type="button"
                aria-pressed={textureId === texture.id}
                onClick={() => {
                  onTextureChange({ textureId: texture.id })
                }}
                className={cn(
                  'relative flex min-h-14 items-end rounded-xl border p-2 font-body text-xs uppercase',
                  {
                    'border-flv-accent text-flv-accent':
                      textureId === texture.id,
                    'border-flv-line text-flv-muted': textureId !== texture.id,
                  },
                )}
              >
                {textureId === texture.id ? (
                  <span className="absolute top-1 right-1 text-flv-accent">
                    ✓
                  </span>
                ) : null}
                {texture.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <aside className="flv-panel flex flex-col gap-3 p-4">
        <button
          type="button"
          className="aspect-square rounded-xl border border-flv-line"
          style={{ backgroundColor: fabricColor }}
          aria-label={`${fabricName} swatch`}
          onClick={() => {
            onColorChange({ color: fabricColor })
          }}
        />
        <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
          {FLV_COPY.colorMaterial}
        </p>
        <h3 className="font-display text-lg text-flv-ink">{fabricName}</h3>
        <p className="font-body text-xs text-flv-muted">
          {patternId} · {textureId} · {finishId}
        </p>
        <ul className="flex flex-col gap-1 font-body text-xs text-flv-muted">
          <li>Premium finish</li>
          <li>Live on cloth</li>
          <li>Studio-ready</li>
        </ul>
      </aside>
    </div>
  )
}

function DesignDemo({
  document: designDocument,
  onDocumentChange,
  onCameraViewChange,
}: {
  document: DesignDocument
  onDocumentChange: DocumentChangeHandler
  onCameraViewChange: ({
    cameraView,
  }: {
    cameraView: LandingCameraView
  }) => void
}) {
  const tools = ['Brush', 'Eraser', 'Fill'] as const
  const stampAssets = GRAPHIC_ASSETS.slice(0, 6)
  const [tool, setTool] = useState<(typeof tools)[number]>('Brush')
  const [size, setSize] = useState(24)
  const [opacity, setOpacity] = useState(100)
  const [ink, setInk] = useState(INK_COLORS[0]!.value)
  const [activeGraphicId, setActiveGraphicId] = useState<string | null>(
    latestLandingGraphicId({ document: designDocument }),
  )
  const strokePoints = useRef<{ x: number; y: number }[]>([])
  const drawing = useRef(false)
  const graphicCount = designDocument.layers.filter(
    (layer) => layer.kind === 'graphic',
  ).length

  useEffect(() => {
    setActiveGraphicId(latestLandingGraphicId({ document: designDocument }))
  }, [designDocument, graphicCount])

  function pointerToUv({
    event,
  }: {
    event: ReactPointerEvent<HTMLCanvasElement>
  }) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
    }
  }

  function clearPad({ canvas }: { canvas: HTMLCanvasElement }) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function commitTransform({
    x,
    y,
    scale,
  }: {
    x?: number
    y?: number
    scale?: number
  }) {
    const layerId =
      activeGraphicId ?? latestLandingGraphicId({ document: designDocument })
    if (!layerId) {
      return
    }

    onDocumentChange({
      apply: (previous) =>
        updateLandingGraphicTransform({
          document: previous,
          layerId,
          x,
          y,
          scale,
        }),
    })
  }

  const activeGraphic = designDocument.layers.find(
    (layer) => layer.kind === 'graphic' && layer.id === activeGraphicId,
  )
  const posX = Math.round(((activeGraphic && 'x' in activeGraphic ? activeGraphic.x : 0.5) as number) * 100)
  const posY = Math.round(((activeGraphic && 'y' in activeGraphic ? activeGraphic.y : 0.48) as number) * 100)
  const scale = Math.round(((activeGraphic && 'scale' in activeGraphic ? activeGraphic.scale : 0.28) as number) * 100)

  return (
    <div className="relative grid gap-4 lg:grid-cols-3">
      <article className="flv-panel flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-flv-ink">
            {FLV_COPY.designLayerDraw}
          </h3>
          <span className="flv-live-badge">{FLV_COPY.designLive}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {tools.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={tool === entry}
              onClick={() => {
                setTool(entry)
              }}
              className={cn(
                'min-h-9 rounded-full border px-3 font-body text-xs uppercase',
                {
                  'border-flv-accent text-flv-accent': tool === entry,
                  'border-flv-line text-flv-muted': tool !== entry,
                },
              )}
            >
              {entry}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between font-body text-xs text-flv-muted">
            <span>Size</span>
            <span>{size}</span>
          </span>
          <input
            type="range"
            min={4}
            max={64}
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value))
            }}
            className="accent-[var(--color-flv-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between font-body text-xs text-flv-muted">
            <span>Opacity</span>
            <span>{opacity}%</span>
          </span>
          <input
            type="range"
            min={10}
            max={100}
            value={opacity}
            onChange={(event) => {
              setOpacity(Number(event.target.value))
            }}
            className="accent-[var(--color-flv-accent)]"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {INK_COLORS.slice(0, 5).map((color) => (
            <button
              key={color.id}
              type="button"
              aria-label={color.name}
              aria-pressed={ink === color.value}
              onClick={() => {
                setInk(color.value)
              }}
              className={cn('size-8 rounded-full border-2', {
                'border-flv-accent': ink === color.value,
                'border-flv-line': ink !== color.value,
              })}
              style={{ backgroundColor: color.value }}
            />
          ))}
        </div>
        <canvas
          aria-label="Design draw pad"
          className="aspect-[4/5] w-full touch-none rounded-xl border border-flv-line bg-flv-soft"
          width={240}
          height={300}
          onPointerDown={(event) => {
            drawing.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            strokePoints.current = [pointerToUv({ event })]
          }}
          onPointerMove={(event) => {
            if (!drawing.current) {
              return
            }
            strokePoints.current = [
              ...strokePoints.current,
              pointerToUv({ event }),
            ]
            const ctx = event.currentTarget.getContext('2d')
            if (!ctx || strokePoints.current.length < 2) {
              return
            }
            const [from, to] = strokePoints.current.slice(-2)
            if (!from || !to) {
              return
            }
            ctx.strokeStyle = tool === 'Eraser' ? '#f3efe6' : ink
            ctx.globalAlpha = opacity / 100
            ctx.lineWidth = Math.max(2, size / 4)
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(from.x * event.currentTarget.width, from.y * event.currentTarget.height)
            ctx.lineTo(to.x * event.currentTarget.width, to.y * event.currentTarget.height)
            ctx.stroke()
          }}
          onPointerUp={(event) => {
            if (!drawing.current) {
              return
            }
            drawing.current = false
            const points = strokePoints.current
            strokePoints.current = []
            clearPad({ canvas: event.currentTarget })
            if (points.length === 0) {
              return
            }
            onDocumentChange({
              apply: (previous) =>
                addLandingStroke({
                  document: previous,
                  points,
                  color: tool === 'Eraser' ? '#ffffff' : ink,
                  width: size / 400,
                  tool,
                  opacity: opacity / 100,
                  panel: 'front',
                }),
            })
          }}
        />
        <p className="font-body text-xs text-flv-muted">
          {FLV_COPY.designLiveSync}
        </p>
      </article>
      <article className="flv-panel flex flex-col gap-3 p-4">
        <h3 className="font-display text-lg text-flv-ink">
          {FLV_COPY.designLayerTech}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {stampAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                onDocumentChange({
                  apply: (previous) =>
                    stampLandingGraphic({
                      document: previous,
                      src: asset.src,
                      panel: 'front',
                    }),
                })
              }}
              className="flex aspect-square items-center justify-center rounded-lg border border-flv-line bg-white p-2 hover:border-flv-accent"
            >
              <img src={asset.src} alt={asset.label} className="max-h-full max-w-full object-contain" />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LANDING_CAMERA_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => {
                onCameraViewChange({ cameraView: view })
              }}
              className="flex aspect-square items-end rounded-xl border border-flv-line p-2 font-body text-xs text-flv-muted uppercase hover:border-flv-accent hover:text-flv-accent"
            >
              {view}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between font-body text-xs text-flv-muted">
            <span>Position X</span>
            <span>{posX}</span>
          </span>
          <input
            type="range"
            min={10}
            max={90}
            value={posX}
            onChange={(event) => {
              commitTransform({ x: Number(event.target.value) / 100 })
            }}
            className="accent-[var(--color-flv-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between font-body text-xs text-flv-muted">
            <span>Position Y</span>
            <span>{posY}</span>
          </span>
          <input
            type="range"
            min={10}
            max={90}
            value={posY}
            onChange={(event) => {
              commitTransform({ y: Number(event.target.value) / 100 })
            }}
            className="accent-[var(--color-flv-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between font-body text-xs text-flv-muted">
            <span>Size</span>
            <span>{scale}%</span>
          </span>
          <input
            type="range"
            min={12}
            max={60}
            value={scale}
            onChange={(event) => {
              commitTransform({ scale: Number(event.target.value) / 100 })
            }}
            className="accent-[var(--color-flv-accent)]"
          />
        </label>
      </article>
      <article className="flv-panel flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-flv-ink">
            {FLV_COPY.designLayerPreview}
          </h3>
          <span className="flv-live-badge">⚡ {FLV_COPY.designLive}</span>
        </div>
        <p className="font-body text-xs text-flv-muted">
          {FLV_COPY.designLiveSync} · graphics {graphicCount} · ink layers live on hero 3D
        </p>
        <div className="grid grid-cols-2 gap-2">
          {designDocument.layers
            .filter((layer) => layer.kind === 'graphic')
            .slice(-4)
            .map((layer) => (
              <button
                key={layer.id}
                type="button"
                aria-pressed={activeGraphicId === layer.id}
                onClick={() => {
                  setActiveGraphicId(layer.id)
                }}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border bg-white p-2',
                  {
                    'border-flv-accent': activeGraphicId === layer.id,
                    'border-flv-line': activeGraphicId !== layer.id,
                  },
                )}
              >
                {'src' in layer ? (
                  <img src={layer.src} alt="" className="max-h-full max-w-full object-contain" />
                ) : null}
              </button>
            ))}
        </div>
      </article>
    </div>
  )
}

function PreviewDemo({
  avatars,
  avatarId,
  measurements,
  envMode,
  onAvatarChange,
  onMeasurementsChange,
  onEnvModeChange,
}: {
  avatars: ReturnType<typeof listAvatars>
  avatarId: string
  measurements: AvatarMeasurements
  envMode: StudioEnvMode
  onAvatarChange: ({ avatarId }: { avatarId: string }) => void
  onMeasurementsChange: ({
    measurements,
  }: {
    measurements: AvatarMeasurements
  }) => void
  onEnvModeChange: ({ envMode }: { envMode: StudioEnvMode }) => void
}) {
  const selected =
    avatars.find((avatar) => avatar.id === avatarId) ?? avatars[0]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flv-panel flex flex-col gap-3 p-4">
        <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
          {FLV_COPY.previewLive}
        </p>
        <p className="font-body text-xs text-flv-muted">
          Avatar and measurements update the hero 3D stage above.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {avatars.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              aria-pressed={avatarId === avatar.id}
              onClick={() => {
                onAvatarChange({ avatarId: avatar.id })
              }}
              className={cn(
                'relative flex min-h-20 flex-col justify-end rounded-xl border p-2 text-left',
                {
                  'border-flv-accent': avatarId === avatar.id,
                  'border-flv-line': avatarId !== avatar.id,
                },
              )}
            >
              {avatarId === avatar.id ? (
                <span className="absolute top-2 right-2 text-flv-accent">✓</span>
              ) : null}
              <span className="font-body text-xs text-flv-ink uppercase">
                {avatar.label}
              </span>
              <span className="font-body text-xs text-flv-muted">
                {avatar.heightCm} cm
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Environment">
          {(['studio', 'outdoor'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={envMode === mode}
              onClick={() => {
                onEnvModeChange({ envMode: mode })
              }}
              className={cn(
                'min-h-9 rounded-full border px-3 font-body text-xs uppercase',
                {
                  'border-flv-accent text-flv-accent': envMode === mode,
                  'border-flv-line text-flv-muted': envMode !== mode,
                },
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <aside className="flv-panel flex flex-col gap-3 p-4">
        <MeasurementSlider
          label="Height"
          value={measurements.height}
          unit="cm"
          min={150}
          max={200}
          onChange={({ value }) => {
            onMeasurementsChange({
              measurements: { ...measurements, height: value },
            })
          }}
        />
        <MeasurementSlider
          label="Chest"
          value={measurements.chest}
          unit="cm"
          min={80}
          max={120}
          onChange={({ value }) => {
            onMeasurementsChange({
              measurements: { ...measurements, chest: value },
            })
          }}
        />
        <MeasurementSlider
          label="Waist"
          value={measurements.waist}
          unit="cm"
          min={60}
          max={110}
          onChange={({ value }) => {
            onMeasurementsChange({
              measurements: { ...measurements, waist: value },
            })
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (!selected) {
              return
            }

            onMeasurementsChange({
              measurements: {
                height: selected.heightCm,
                chest: selected.chestCm,
                waist: selected.waistCm,
              },
            })
          }}
          className="min-h-10 rounded-full border border-flv-line px-3 font-body text-xs text-flv-muted uppercase hover:border-flv-accent hover:text-flv-accent"
        >
          Reset measurements
        </button>
      </aside>
    </div>
  )
}

function MeasurementSlider({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  onChange: ({ value }: { value: number }) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between font-body text-xs text-flv-muted">
        <span>{label}</span>
        <span className="text-flv-accent">
          {value} {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => {
          onChange({ value: Number(event.target.value) })
        }}
        className="accent-[var(--color-flv-accent)]"
      />
    </label>
  )
}

function ShareDemo({
  onBeforeStudioNavigate,
}: {
  onBeforeStudioNavigate?: () => void
}) {
  const angles = ['Front', '3/4', 'Back'] as const
  const methods = ['Draw', 'Tech', 'Combined'] as const
  const visibilityOptions = ['Public', 'Private', 'Unlisted'] as const
  const [angle, setAngle] = useState<(typeof angles)[number]>('Front')
  const [title, setTitle] = useState('Cross Flame Oversized Tee')
  const [tags, setTags] = useState('Streetwear, Oversized, Graphic')
  const [method, setMethod] = useState<(typeof methods)[number]>('Combined')
  const [visibility, setVisibility] =
    useState<(typeof visibilityOptions)[number]>('Public')
  const still =
    CANNED_STILLS[angles.indexOf(angle) % CANNED_STILLS.length]!

  return (
    <div className="flv-panel grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-xl border border-flv-line">
          <img
            src={still}
            alt=""
            className="aspect-[4/5] w-full object-cover"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {angles.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={angle === label}
              onClick={() => {
                setAngle(label)
              }}
              className={cn(
                'relative flex aspect-[4/5] items-end overflow-hidden rounded-xl border p-2 font-body text-xs tracking-[0.08em] uppercase',
                {
                  'border-flv-accent text-flv-accent': angle === label,
                  'border-flv-line text-flv-muted': angle !== label,
                },
              )}
            >
              <img
                src={CANNED_STILLS[index % CANNED_STILLS.length]}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-80"
              />
              <span className="relative z-10 bg-flv-paper/80 px-1">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-body text-xs tracking-[0.1em] text-flv-muted uppercase">
            Design title
          </span>
          <input
            value={title}
            maxLength={100}
            onChange={(event) => {
              setTitle(event.target.value)
            }}
            className="min-h-11 rounded-xl border border-flv-line bg-flv-paper px-3 font-body text-sm"
          />
          <span className="font-body text-xs text-flv-muted">
            {title.length}/100
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-body text-xs tracking-[0.1em] text-flv-muted uppercase">
            Tags
          </span>
          <input
            value={tags}
            onChange={(event) => {
              setTags(event.target.value)
            }}
            className="min-h-11 rounded-xl border border-flv-line bg-flv-paper px-3 font-body text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {methods.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={method === entry}
              onClick={() => {
                setMethod(entry)
              }}
              className={cn(
                'min-h-9 rounded-xl border px-3 font-body text-xs uppercase',
                {
                  'border-flv-accent text-flv-accent': method === entry,
                  'border-flv-line text-flv-muted': method !== entry,
                },
              )}
            >
              {entry}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {visibilityOptions.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={visibility === entry}
              onClick={() => {
                setVisibility(entry)
              }}
              className={cn(
                'min-h-9 rounded-full border px-3 font-body text-xs uppercase',
                {
                  'border-flv-accent text-flv-accent': visibility === entry,
                  'border-flv-line text-flv-muted': visibility !== entry,
                },
              )}
            >
              {entry}
            </button>
          ))}
        </div>
        <Link
          to="/create"
          search={{ step: 'share' }}
          onClick={() => {
            onBeforeStudioNavigate?.()
          }}
          className="flv-cta inline-flex min-h-11 items-center justify-center px-4 font-body text-xs tracking-[0.1em] uppercase"
        >
          {FLV_COPY.sharePublish} →
        </Link>
      </div>
    </div>
  )
}

function CommunityDemo({
  looks,
}: {
  looks: Design[]
}) {
  return (
    <div
      id="community"
      className="flv-panel flex flex-col gap-4 p-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl text-flv-ink">
            {FLV_COPY.voteTitle}
          </h3>
          <p className="font-body text-sm text-flv-muted">{FLV_COPY.voteLead}</p>
        </div>
        <Link
          to="/vote"
          search={{}}
          className="flv-cta inline-flex min-h-11 items-center px-4 font-body text-xs tracking-[0.1em] uppercase"
        >
          {FLV_COPY.seeBoard} →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {looks.length === 0 ? (
          <p className="font-body text-sm text-flv-muted">
            Board looks load when the house is live.
          </p>
        ) : null}
        {looks.map((look, index) => (
          <Link
            key={look.id}
            to="/look/$lookId"
            params={{ lookId: look.id }}
            className="relative flex w-36 shrink-0 flex-col gap-2"
          >
            <span
              className={cn(
                'absolute top-2 left-2 z-10 inline-flex size-6 items-center justify-center rounded-full font-body text-xs text-white',
                {
                  'bg-flv-accent': index === 0,
                  'bg-flv-muted': index === 1,
                  'bg-flv-accent-hot': index === 2,
                  'bg-flv-ink': index > 2,
                },
              )}
            >
              {index + 1}
            </span>
            <div className="aspect-[4/5] overflow-hidden rounded-xl border border-flv-line bg-flv-line/40">
              {isSafeThumbnail({
                thumbnailDataUrl: look.thumbnailDataUrl,
              }) ? (
                <img
                  src={look.thumbnailDataUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <p className="truncate font-body text-xs text-flv-ink">
              {look.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}

function FitChip({
  label,
  pressed,
  onPress,
}: {
  label: string
  pressed: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        'min-h-11 rounded-full border px-3 font-body text-xs tracking-[0.08em] uppercase',
        {
          'border-flv-accent text-flv-accent': pressed,
          'border-flv-line text-flv-muted hover:text-flv-accent': !pressed,
        },
      )}
    >
      {label}
    </button>
  )
}
