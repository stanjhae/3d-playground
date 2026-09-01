import type { GarmentId } from './design-schema'

export const GARMENT_SRC = {
  column: '/models/garment.glb',
  jacket: '/models/jacket.glb',
} as const

export const GARMENT_PARTS = [
  { id: 'body', label: 'Body' },
  { id: 'lining', label: 'Lining' },
  { id: 'collar', label: 'Collar' },
  { id: 'hardware', label: 'Hardware' },
] as const

const COLUMN_PARTS = GARMENT_PARTS.filter((part) => part.id === 'body')

export function garmentSrc({
  garmentId,
}: {
  garmentId?: GarmentId | null
}) {
  return garmentId === 'jacket' ? GARMENT_SRC.jacket : GARMENT_SRC.column
}

export function garmentParts({
  garmentId,
}: {
  garmentId?: GarmentId | null
}) {
  return garmentId === 'jacket' ? GARMENT_PARTS : COLUMN_PARTS
}

export function partLabel({ meshName }: { meshName: string }) {
  const [head] = meshName.split('-')
  const known = GARMENT_PARTS.find((part) => part.id === head)

  return known?.label ?? head.charAt(0).toUpperCase() + head.slice(1)
}
