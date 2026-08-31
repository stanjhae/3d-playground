import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'

import { cloneObjectMaterials } from '../../lib/apply-overrides'

const DRACO_DECODER_PATH = '/draco/'
const DEFAULT_GARMENT_SRC = '/models/garment.glb'

useGLTF.setDecoderPath(DRACO_DECODER_PATH)
useGLTF.preload(DEFAULT_GARMENT_SRC)

export function Garment({ src = DEFAULT_GARMENT_SRC }: { src?: string }) {
  const { scene } = useGLTF(src)
  const cloned = useMemo(() => {
    const root = scene.clone(true)
    cloneObjectMaterials({ root })
    return root
  }, [scene])

  return <primitive object={cloned} />
}
