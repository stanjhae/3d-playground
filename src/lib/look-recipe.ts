import type { MaterialOverride } from './design-schema.ts'
import { getFabricForOverride } from './fabrics.ts'
import { getGarment } from './garments.ts'

function partIdForOverride({
  meshName,
  partIds,
}: {
  meshName: string
  partIds: readonly string[]
}) {
  return (
    partIds.find(
      (partId) =>
        meshName === partId || meshName.startsWith(`${partId}-`),
    ) ?? null
  )
}

function joinClothNames({ names }: { names: string[] }) {
  if (names.length === 0) {
    return ''
  }

  if (names.length === 1) {
    return names[0] ?? ''
  }

  const last = names[names.length - 1] ?? ''
  const head = names.slice(0, -1).join(', ')

  return `${head} and ${last}`
}

export function lookRecipe({
  design,
}: {
  design: { garmentId?: string; overrides: MaterialOverride[] }
}) {
  const garment = getGarment({ garmentId: design.garmentId })
  const partIds = garment.parts.map((part) => part.id)
  const clothByPart = new Map<string, string>()

  for (const override of design.overrides) {
    const partId = partIdForOverride({
      meshName: override.meshName,
      partIds,
    })

    if (!partId) {
      continue
    }

    const fabric = getFabricForOverride({
      mapId: override.mapId,
      color: override.color,
    })

    if (!fabric) {
      continue
    }

    clothByPart.set(partId, fabric.name)
  }

  const names: string[] = []

  for (const part of garment.parts) {
    const name = clothByPart.get(part.id)

    if (name && !names.includes(name)) {
      names.push(name)
    }
  }

  const cloth = joinClothNames({ names })

  if (!cloth) {
    return garment.label
  }

  return `${garment.label} · ${cloth}`
}

export function lookShareLine({
  recipe,
  author,
}: {
  recipe: string
  author: string
}) {
  const by = author.trim()
    ? `By ${author.trim().slice(0, 40)}`
    : 'The house is open.'

  if (!recipe) {
    return by
  }

  return `${recipe}. ${by}`
}
