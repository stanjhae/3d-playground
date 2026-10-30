import {
  createFileRoute,
  redirect,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { LandingCloth } from '../components/landing/LandingCloth'
import { LandingFlowOverview } from '../components/landing/LandingFlowOverview'
import { LandingHero } from '../components/landing/LandingHero'
import { LandingSoon } from '../components/landing/LandingSoon'
import { LandingStageHost } from '../components/landing/LandingStageHost'
import { LandingStageRail } from '../components/landing/LandingStageRail'
import { LandingWaitlist } from '../components/landing/LandingWaitlist'
import { trackAssumption } from '../lib/assumption-events'
import type { AvatarMeasurements } from '../lib/avatar-geometry'
import { DEFAULT_AVATAR_MEASUREMENTS } from '../lib/avatars'
import { createCrossFlameDemoDocument } from '../lib/cross-flame-demo'
import type { HemId, NeckId, SleeveId } from '../lib/design-document'
import type { GarmentId } from '../lib/design-schema'
import {
  landingClothOverrides,
  type LandingCameraView,
  type LandingTextureId,
  type StudioEnvMode,
} from '../lib/landing-demo'
import type { LandingStageId } from '../lib/landing-stages'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => {
    const design =
      typeof search.design === 'string' && search.design.length > 0
        ? search.design
        : undefined

    return design ? { design } : {}
  },
  beforeLoad: ({ search }) => {
    if (search.design) {
      throw redirect({
        to: '/create',
        search: { design: search.design },
      })
    }
  },
  component: LandingPage,
})

function LandingPage() {
  const [activeStage, setActiveStage] = useState<LandingStageId>('select')
  const [garmentId, setGarmentId] = useState<GarmentId>('tee')
  const [clothColor, setClothColor] = useState('#f7f7f7')
  const [textureId, setTextureId] = useState<LandingTextureId>('standard')
  const [neck, setNeck] = useState<NeckId>('crew')
  const [hem, setHem] = useState<HemId>('long')
  const [sleeve, setSleeve] = useState<SleeveId>('short')
  const [designDocument, setDesignDocument] = useState(() =>
    createCrossFlameDemoDocument(),
  )
  const [cameraView, setCameraView] = useState<LandingCameraView | null>(null)
  const [measurements, setMeasurements] = useState<AvatarMeasurements>({
    height: DEFAULT_AVATAR_MEASUREMENTS.height,
    chest: DEFAULT_AVATAR_MEASUREMENTS.chest,
    waist: DEFAULT_AVATAR_MEASUREMENTS.waist,
  })
  const [envMode, setEnvMode] = useState<StudioEnvMode>('studio')

  useEffect(() => {
    void trackAssumption({ name: 'viewed_demo' })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function applyHash() {
      const hash = window.location.hash

      if (hash === '#waitlist') {
        window.document
          .getElementById('waitlist')
          ?.scrollIntoView({ behavior: 'smooth' })
        return
      }

      if (hash === '#community') {
        setActiveStage('vote')
        return
      }

      if (hash === '#flow') {
        window.document
          .getElementById('flow')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      if (hash === '#product') {
        window.document
          .getElementById('product')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    applyHash()
    window.addEventListener('hashchange', applyHash)

    return () => {
      window.removeEventListener('hashchange', applyHash)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (window.location.hash !== '#community' || activeStage !== 'vote') {
      return
    }

    window.requestAnimationFrame(() => {
      window.document
        .getElementById('community')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [activeStage])

  return (
    <div className="flv min-h-dvh">
      <LandingHero
        document={designDocument}
        cameraView={cameraView}
        garmentId={garmentId}
        clothColor={clothColor}
        neck={neck}
        hem={hem}
        sleeve={sleeve}
        onDocumentChange={({ apply }) => {
          setDesignDocument((previous) => apply(previous))
        }}
        onCameraViewChange={({ cameraView: next }) => {
          setCameraView(next)
        }}
        stage={
          <LandingCloth
            garmentId={garmentId}
            overrides={landingClothOverrides({
              color: clothColor,
              textureId,
            })}
            structural={{ neck, hem, sleeve }}
            document={designDocument}
            measurements={measurements}
            cameraView={cameraView ?? undefined}
            envMode={envMode}
          />
        }
      />
      <LandingFlowOverview
        onSelect={({ stage }) => {
          setActiveStage(stage)
          window.requestAnimationFrame(() => {
            window.document
              .getElementById('product-stages')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        }}
      />
      <LandingStageRail
        activeStage={activeStage}
        onSelect={({ stage }) => {
          setActiveStage(stage)
        }}
      />
      <LandingStageHost
        activeStage={activeStage}
        garmentId={garmentId}
        clothColor={clothColor}
        textureId={textureId}
        neck={neck}
        hem={hem}
        sleeve={sleeve}
        document={designDocument}
        measurements={measurements}
        envMode={envMode}
        onStageChange={({ stage }) => {
          setActiveStage(stage)
        }}
        onGarmentChange={({ garmentId: next }) => {
          setGarmentId(next)
        }}
        onColorChange={({ color }) => {
          setClothColor(color)
        }}
        onTextureChange={({ textureId: next }) => {
          setTextureId(next)
        }}
        onNeckChange={({ neck: next }) => {
          setNeck(next)
        }}
        onHemChange={({ hem: next }) => {
          setHem(next)
        }}
        onSleeveChange={({ sleeve: next }) => {
          setSleeve(next)
        }}
        onDocumentChange={({ apply }) => {
          setDesignDocument((previous) => apply(previous))
        }}
        onMeasurementsChange={({ measurements: next }) => {
          setMeasurements(next)
        }}
        onEnvModeChange={({ envMode: next }) => {
          setEnvMode(next)
        }}
        onCameraViewChange={({ cameraView: next }) => {
          setCameraView(next)
        }}
      />
      <LandingSoon />
      <LandingWaitlist />
    </div>
  )
}
