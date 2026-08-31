import { Html, Outlines, useCursor } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import { useState, type ReactNode } from 'react'
import { type Mesh } from 'three'

import { useEditorStore } from '../../lib/editor-store'
import { partLabel } from '../../lib/garment-parts'

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
  const selectedMeshName = useEditorStore((state) => state.selectedMeshName)
  const isSelected = Boolean(
    selectedMeshName &&
      (selectedMeshName === name || name.startsWith(`${selectedMeshName}-`)),
  )
  const selectMesh = useEditorStore((state) => state.selectMesh)
  const [hovered, setHovered] = useState(false)
  const canPick = picking && mode === 'design'
  const showCaption = canPick && hovered && !name.includes('-')

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
        selectMesh({ selectedMeshName: name.split('-')[0] ?? name })
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
      {canPick && (isSelected || hovered) ? (
        <Outlines color="#c4a15a" thickness={isSelected ? 0.006 : 0.003} />
      ) : null}
      {showCaption ? (
        <Html center distanceFactor={4} style={{ pointerEvents: 'none' }}>
          <p className="-translate-y-10 font-display text-[10px] tracking-[0.22em] text-brass uppercase">
            {partLabel({ meshName: name })}
          </p>
        </Html>
      ) : null}
      {children}
    </primitive>
  )
}
