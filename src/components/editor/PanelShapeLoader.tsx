import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'

import type { DesignDocument } from '../../lib/design-document'
import { shapesFromScene, usePanelShapes } from '../../lib/panel-shape'

// The site serves the decoder itself (CSP: no CDN), as Garment.tsx sets.
useGLTF.setDecoderPath('/draco/')

/**
 * Reads the side shapes when the 3D view isn't mounted (a phone's Draw
 * view). It loads the model through drei's own loader and cache, the ones
 * the 3D garment uses, so there's no second decoder and usually no second
 * download. Render it inside a Suspense boundary.
 */
export function PanelShapeLoader({
  modelSrc,
  panelUv,
}: {
  modelSrc: string
  panelUv: NonNullable<DesignDocument['panelUv']>
}) {
  const { scene } = useGLTF(modelSrc)

  useEffect(() => {
    if (usePanelShapes.getState().src !== modelSrc) {
      usePanelShapes.getState().setShapes({ src: modelSrc, shapes: shapesFromScene({ scene, panelUv }) })
    }
  }, [modelSrc, panelUv, scene])

  return null
}
