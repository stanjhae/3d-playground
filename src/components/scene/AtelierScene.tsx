import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState, type ReactNode } from 'react'

import { listDesigns } from '../../lib/designs-api'
import { resolveGarmentId, type Design } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { studioStageBackdrop } from '../../lib/landing-demo'
import { lookRecipe } from '../../lib/look-recipe'
import { rankDesigns } from '../../lib/rank-designs'
import { AvatarBody } from './AvatarBody'
import { EditRenderProbe } from './EditRenderProbe'
import { FashionLoader } from './FashionLoader'
import { Garment } from './Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from './StudioStage'
import { AtlasStatusNote } from './AtlasStatusNote'
import { WebglContextWatcher, WebglGuard } from './WebglGuard'

function HouseCaption({
  title,
  recipe,
}: {
  title: string
  recipe: string
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-flv-paper via-flv-paper/60 to-transparent px-4 pt-16 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-16">
      <p className="font-display text-xs tracking-[0.22em] text-flv-accent uppercase">
        {HOUSE_COPY.leader}
      </p>
      <p className="font-display text-2xl text-flv-ink sm:text-3xl">{title}</p>
      {recipe ? (
        <p className="font-body text-sm text-flv-muted">{recipe}</p>
      ) : null}
    </div>
  )
}

/** Preview & Publish shows a chosen avatar wearing the tee. */
function isTryOn({
  createStep,
  avatarId,
  garmentId,
}: {
  createStep: string
  avatarId: string | null
  garmentId: string
}) {
  return createStep === 'share' && Boolean(avatarId) && garmentId === 'tee'
}

function DesignGarment() {
  const garmentId = useEditorStore((state) => state.garmentId)
  const tryOn = useEditorStore(isTryOn)

  if (tryOn) {
    return (
      <AvatarBody>
        <Garment garmentId={garmentId} />
      </AvatarBody>
    )
  }

  return <Garment garmentId={garmentId} />
}

export function AtelierScene({ children }: { children?: ReactNode }) {
  const mode = useEditorStore((state) => state.mode)
  const [leader, setLeader] = useState<Design | null>(null)
  const isHouse = mode === 'atelier'
  const garmentId = useEditorStore((state) => state.garmentId)
  const tryOn = useEditorStore(isTryOn)
  const framing =
    !tryOn && resolveGarmentId({ garmentId: isHouse ? leader?.garmentId : garmentId }) === 'tee'
      ? 'garment'
      : 'figure'

  useEffect(() => {
    if (!isHouse) {
      return
    }

    let cancelled = false

    void listDesigns()
      .then((designs) => {
        if (!cancelled) {
          setLeader(rankDesigns({ designs })[0] ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeader(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isHouse])

  // Below lg the stage can be shorter than 20rem; the scene class keeps it clear of the tools.
  return (
    <div className="relative h-full min-h-48 w-full lg:min-h-80">
      {isHouse ? (
        <HouseCaption
          title={leader?.title ?? 'The Leader'}
          recipe={leader ? lookRecipe({ design: leader }) : ''}
        />
      ) : null}
      <WebglGuard>
        <Canvas
          shadows
          frameloop="demand"
          camera={{
            position: [...STUDIO_CAMERA.position],
            fov: STUDIO_CAMERA.fov,
            near: STUDIO_CAMERA.near,
            far: STUDIO_CAMERA.far,
          }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          className="h-full min-h-48 w-full touch-none lg:min-h-80"
          style={{ background: studioStageBackdrop() }}
        >
          <StudioStage picking={!isHouse} intro framing={framing}>
            <Suspense fallback={<FashionLoader />}>
              {isHouse ? (
                leader ? (
                  <Garment
                    garmentId={leader.garmentId}
                    overrides={leader.overrides}
                    artMap={leader.artMap}
                    picking={false}
                  />
                ) : null
              ) : (
                <>
                  <DesignGarment />
                  {children}
                </>
              )}
            </Suspense>
          </StudioStage>
          <StudioOrbit intro turntable={isHouse} />
          <WebglContextWatcher />
          {isHouse ? null : <EditRenderProbe />}
        </Canvas>
      </WebglGuard>
      <AtlasStatusNote />
    </div>
  )
}
