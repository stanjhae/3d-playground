import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'

import {
  createProceduralAvatar,
  disposeAvatarGroup,
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
          {children}
        </ClothingPoseContext.Provider>
      </group>
    </group>
  )
}
