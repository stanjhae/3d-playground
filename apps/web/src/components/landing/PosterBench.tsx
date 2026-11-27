import { useMemo, useState } from 'react'

import { createCrossFlameDemoDocument } from '../../lib/cross-flame-demo'
import { landingClothOverrides } from '../../lib/landing-demo'
import { LANDING_TEE_COLOR } from '../../lib/landing-demo-store'
import LandingCloth from './LandingCloth'

/**
 * Dev only (`/?poster=1`): the hero's tee alone, still, on a transparent
 * page, for scripts/bake-landing-poster.mjs to photograph.
 */
export default function PosterBench() {
  const [ready, setReady] = useState(false)
  const document = useMemo(() => createCrossFlameDemoDocument(), [])
  const overrides = useMemo(() => landingClothOverrides({ color: LANDING_TEE_COLOR, textureId: 'standard' }), [])

  return (
    <div data-poster-ready={ready ? 'true' : 'false'} className="fixed inset-0 z-50 bg-transparent">
      <LandingCloth overrides={overrides} document={document} spin={false} onReady={() => setTimeout(() => setReady(true), 1500)} />
    </div>
  )
}
