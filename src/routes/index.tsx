import {
  createFileRoute,
  redirect,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { LandingCloth } from '../components/landing/LandingCloth'
import { LandingHero } from '../components/landing/LandingHero'
import { LandingSoon } from '../components/landing/LandingSoon'
import { LandingStageHost } from '../components/landing/LandingStageHost'
import { LandingStageRail } from '../components/landing/LandingStageRail'
import { LandingWaitlist } from '../components/landing/LandingWaitlist'
import { trackAssumption } from '../lib/assumption-events'
import type { HemId, NeckId, SleeveId } from '../lib/design-document'
import type { GarmentId, MaterialOverride } from '../lib/design-schema'
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
  const [clothColor, setClothColor] = useState('#f4ead4')
  const [neck, setNeck] = useState<NeckId>('crew')
  const [hem, setHem] = useState<HemId>('crop')
  const [sleeve, setSleeve] = useState<SleeveId>('short')
  const overrides: MaterialOverride[] = [
    { meshName: 'body', color: clothColor },
  ]
  const structural = { neck, hem, sleeve }

  useEffect(() => {
    void trackAssumption({ name: 'viewed_demo' })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (window.location.hash !== '#waitlist') {
      return
    }

    window.requestAnimationFrame(() => {
      document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [])

  return (
    <div className="flv min-h-dvh">
      <LandingHero
        stage={
          <LandingCloth
            garmentId={garmentId}
            overrides={overrides}
            structural={structural}
          />
        }
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
        neck={neck}
        hem={hem}
        sleeve={sleeve}
        onStageChange={({ stage }) => {
          setActiveStage(stage)
        }}
        onGarmentChange={({ garmentId: next }) => {
          setGarmentId(next)
        }}
        onColorChange={({ color }) => {
          setClothColor(color)
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
      />
      <LandingSoon />
      <LandingWaitlist />
    </div>
  )
}
