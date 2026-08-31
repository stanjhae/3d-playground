import { Outlines, useCursor } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import { useState, type ReactNode } from 'react'
import { type Mesh } from 'three'

import { useEditorStore } from '../../lib/editor-store'

export function SelectableMesh({
  name,
  mesh,
  children,
  picking = true,
}: {
  name: string
  mesh: Mesh
  children?: ReactNode
  picking?: boolean
}) {
  const mode = useEditorStore((state) => state.mode)
  const isSelected = useEditorStore((state) => state.selectedMeshName === name)
  const selectMesh = useEditorStore((state) => state.selectMesh)
  const [hovered, setHovered] = useState(false)
  const canPick = picking && mode === 'design'

  useCursor(canPick && hovered)

  return (
    <primitive
      object={mesh}
      name={name}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (!canPick) {
          return
        }

        event.stopPropagation()
        selectMesh({ selectedMeshName: name })
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        if (!canPick) {
          return
        }

        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => {
        setHovered(false)
      }}
    >
      {canPick && isSelected ? (
        <Outlines color="#c4a15a" thickness={0.012} />
      ) : null}
      {children}
    </primitive>
  )
}
