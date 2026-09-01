import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState, type ReactNode } from 'react'

import { listDesigns } from '../../lib/designs-api'
import type { Design } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { lookRecipe } from '../../lib/look-recipe'
import { rankDesigns } from '../../lib/rank-designs'
import { FashionLoader } from './FashionLoader'
import { Garment } from './Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from './StudioStage'

function HouseCaption({
  title,
  recipe,
}: {
  title: string
  recipe: string
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-atelier via-atelier/40 to-transparent px-4 pt-16 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-16">
      <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
        The Leader
      </p>
      <p className="font-display text-2xl text-ivory sm:text-3xl">{title}</p>
      {recipe ? (
        <p className="text-sm text-ivory-muted">{recipe}</p>
      ) : null}
    </div>
  )
}

export function AtelierScene({ children }: { children?: ReactNode }) {
  const mode = useEditorStore((state) => state.mode)
  const garmentId = useEditorStore((state) => state.garmentId)
  const isHouse = mode === 'atelier'
  const [leader, setLeader] = useState<Design | null>(null)

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

  return (
    <div className="relative h-full min-h-80 w-full">
      {isHouse ? (
        <HouseCaption
          title={leader?.title ?? 'The Leader'}
          recipe={leader ? lookRecipe({ design: leader }) : ''}
        />
      ) : null}
      <Canvas
        shadows
        camera={{
          position: [...STUDIO_CAMERA.position],
          fov: STUDIO_CAMERA.fov,
          near: STUDIO_CAMERA.near,
          far: STUDIO_CAMERA.far,
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="h-full min-h-80 w-full bg-atelier"
      >
        <StudioStage picking={!isHouse} intro>
          <Suspense fallback={<FashionLoader />}>
            {isHouse ? (
              leader ? (
                <Garment
                  garmentId={leader.garmentId}
                  overrides={leader.overrides}
                  picking={false}
                />
              ) : null
            ) : (
              <>
                <Garment garmentId={garmentId} />
                {children}
              </>
            )}
          </Suspense>
        </StudioStage>
        <StudioOrbit intro turntable={isHouse} />
      </Canvas>
    </div>
  )
}
