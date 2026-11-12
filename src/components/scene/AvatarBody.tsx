import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'

import {
  createProceduralAvatar,
  disposeAvatarGroup,
  realGarmentSeat,
  type AvatarMeasurements,
} from '../../lib/avatar-geometry'
import { useEditorStore } from '../../lib/editor-store'
import { ClothingPoseContext } from './clothing-pose'

export function AvatarBody({
  children,
  measurements: measurementsProp,
}: {
  children?: ReactNode
  measurements?: AvatarMeasurements
}) {
  const storeMeasurements = useEditorStore((state) => state.avatarMeasurements)
  // A real model (the @4 tee) is fitted into the worn tee's place on the body.
  const modelFrame = useEditorStore((state) => state.document.modelFrame)
  const realSeat = useMemo(() => (modelFrame ? realGarmentSeat({ frame: modelFrame }) : null), [modelFrame])
  const avatarMeasurements = measurementsProp ?? storeMeasurements
  const [mount, setMount] = useState<{
    root: Group
    garment: ReturnType<typeof createProceduralAvatar>['garment']
  } | null>(null)
  const mountRef = useRef(mount)
  mountRef.current = mount

  useEffect(() => {
    const built = createProceduralAvatar({ measurements: avatarMeasurements })
    setMount((previous) => {
      if (previous) {
        disposeAvatarGroup({ group: previous.root })
      }

      return {
        root: built.root,
        garment: built.garment,
      }
    })
  }, [avatarMeasurements])

  useEffect(() => {
    return () => {
      const current = mountRef.current

      if (current) {
        disposeAvatarGroup({ group: current.root })
      }
    }
  }, [])

  if (!mount) {
    return null
  }

  return (
    <group>
      <primitive object={mount.root} />
      <group position={mount.garment.position} scale={mount.garment.scale}>
        <ClothingPoseContext.Provider value="worn">
          {realSeat ? (
            <group position={realSeat.position} scale={realSeat.scale}>
              {children}
            </group>
          ) : (
            children
          )}
        </ClothingPoseContext.Provider>
      </group>
    </group>
  )
}
