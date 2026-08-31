import type { ReactNode } from 'react'
import '@react-three/fiber'

export function SelectableMesh({
  name,
  children,
}: {
  name: string
  children?: ReactNode
}) {
  return <group name={name}>{children}</group>
}
