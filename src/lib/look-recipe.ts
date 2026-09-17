import type { StructuralParams } from './design-document.ts'
import type { Design, MaterialOverride } from './design-schema.ts'
import { getFabricForOverride } from './fabrics.ts'
import { getGarment } from './garments.ts'
import { rankDesigns } from './rank-designs.ts'

function cutWords({
  structural,
}: {
  structural?: StructuralParams
}) {
  if (!structural) {
    return []
  }

  const words: string[] = []

  if (structural.neck === 'v') {
    words.push('V')
  }

  if (structural.neck === 'crew') {
    words.push('Crew')
  }

  if (structural.hem === 'crop') {
    words.push('Crop')
  }

  if (structural.hem === 'long') {
    words.push('Long hem')
  }

  if (structural.sleeve === 'long') {
    words.push('Long sleeve')
  }

  return words
}

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

export function lookHasInk({
  design,
}: {
  design: Pick<Design, 'artMap'>
}) {
  return Boolean(design.artMap)
}

export function pickSoonLooks({
  designs,
}: {
  designs: Design[]
}) {
  const ranked = rankDesigns({ designs })
  const leader = ranked[0]
  const painted = ranked.filter((look) => lookHasInk({ design: look }))
  const rest = ranked.filter((look) => !lookHasInk({ design: look }))
  const chosen: Design[] = []
  const seen = new Set<string>()

  for (const look of [leader, ...painted, ...rest]) {
    if (!look || seen.has(look.id)) {
      continue
    }

    seen.add(look.id)
    chosen.push(look)
  }

  return chosen.slice(0, 3)
}

export function lookRecipe({
  design,
}: {
  design: {
    garmentId?: string
    overrides: MaterialOverride[]
    artMap?: string
    structural?: StructuralParams
  }
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
  const ink = lookHasInk({ design }) ? 'Ink' : ''
  const extras = [
    ...cutWords({ structural: design.structural }),
    cloth,
    ink,
  ]
    .filter(Boolean)
    .join(' · ')

  if (!extras) {
    return garment.label
  }

  return `${garment.label} · ${extras}`
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
