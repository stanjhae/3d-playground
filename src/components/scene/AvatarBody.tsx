import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'

import {
  createProceduralAvatar,
  disposeAvatarGroup,
} from '../../lib/avatar-geometry'
import { useEditorStore } from '../../lib/editor-store'

export function AvatarBody({
  children,
}: {
  children?: ReactNode
}) {
  const avatarMeasurements = useEditorStore((state) => state.avatarMeasurements)
  const [mount, setMount] = useState<{
    root: Group
    garmentOffsetY: number
    garmentScale: number
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
        garmentOffsetY: built.garmentOffsetY,
        garmentScale: built.garmentScale,
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
      <group
        position={[0, mount.garmentOffsetY * 0.02, 0.015]}
        scale={mount.garmentScale}
      >
        {children}
      </group>
    </group>
  )
}
