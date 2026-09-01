import type { GarmentId } from './design-schema.ts'
import { resolveGarmentId } from './design-schema.ts'
import {
  GOWN_CREDIT_HREF,
  GOWN_LICENSE_HREF,
  HOUSE_COPY,
} from './house-copy.ts'

export type GarmentPartId =
  | 'body'
  | 'skirt'
  | 'lining'
  | 'collar'
  | 'hardware'

export type GarmentPart = {
  id: GarmentPartId
  label: string
}

export type GarmentCredit = {
  label: string
  href: string
  license: string
  licenseHref: string
}

export type GarmentEntry = {
  id: GarmentId
  label: string
  src: string
  parts: readonly GarmentPart[]
  rail: boolean
  credit?: GarmentCredit
}

export const GARMENT_PARTS: readonly GarmentPart[] = [
  { id: 'body', label: 'Body' },
  { id: 'skirt', label: 'Skirt' },
  { id: 'lining', label: 'Lining' },
  { id: 'collar', label: 'Collar' },
  { id: 'hardware', label: 'Hardware' },
] as const

const STYLE3D_LICENSE = {
  license: 'CC BY 4.0',
  licenseHref: 'https://creativecommons.org/licenses/by/4.0/',
} as const

function partsNamed({
  ids,
}: {
  ids: readonly GarmentPartId[]
}): GarmentPart[] {
  return ids.map((id) => {
    const part = GARMENT_PARTS.find((entry) => entry.id === id)

    if (!part) {
      throw new Error(`Unknown garment part ${id}`)
    }

    return part
  })
}

export const GARMENTS: readonly GarmentEntry[] = [
  {
    id: 'gown',
    label: 'Gown',
    src: '/models/garment.glb',
    parts: partsNamed({ ids: ['body'] }),
    rail: true,
    credit: {
      label: HOUSE_COPY.gownCredit,
      href: GOWN_CREDIT_HREF,
      license: HOUSE_COPY.gownLicense,
      licenseHref: GOWN_LICENSE_HREF,
    },
  },
  {
    id: 'slip',
    label: 'Slip',
    src: '/models/slip.glb',
    parts: partsNamed({ ids: ['body'] }),
    rail: true,
    credit: {
      label: 'Slip by Style3D CG',
      href: 'https://sketchfab.com/3d-models/black-dress-b0b0e79eca3d4927b9bb25ded81221ec',
      ...STYLE3D_LICENSE,
    },
  },
  {
    id: 'mixed',
    label: 'Shirt & skirt',
    src: '/models/mixed.glb',
    parts: partsNamed({ ids: ['body', 'skirt', 'hardware'] }),
    rail: true,
    credit: {
      label: 'Shirt and skirt by Style3D CG',
      href: 'https://sketchfab.com/3d-models/white-shirt-black-leather-skirt-outfit-9f9e3d05217a4f969cd08224ad0b0aee',
      ...STYLE3D_LICENSE,
    },
  },
  {
    id: 'coat',
    label: 'Coat',
    src: '/models/coat.glb',
    parts: partsNamed({ ids: ['body', 'hardware'] }),
    rail: true,
    credit: {
      label: 'Coat by Style3D CG',
      href: 'https://sketchfab.com/3d-models/black-jacket-coat-2181e25803164fd690c0debb4d4f391a',
      ...STYLE3D_LICENSE,
    },
  },
  {
    id: 'suit',
    label: 'Suit',
    src: '/models/suit.glb',
    parts: partsNamed({ ids: ['body', 'hardware'] }),
    rail: true,
    credit: {
      label: 'Suit by Style3D CG',
      href: 'https://sketchfab.com/3d-models/white-suit-set-46111b5492f944bd862b8ca9ca4ba78b',
      ...STYLE3D_LICENSE,
    },
  },
  {
    id: 'jacket',
    label: 'Jacket',
    src: '/models/jacket.glb',
    parts: partsNamed({ ids: ['body', 'lining', 'collar', 'hardware'] }),
    rail: false,
  },
]

const garmentsById = new Map(
  GARMENTS.map((garment) => [garment.id, garment]),
)

export function getGarment({
  garmentId,
}: {
  garmentId?: string | null
}): GarmentEntry {
  const resolved = resolveGarmentId({ garmentId })

  return garmentsById.get(resolved) ?? GARMENTS[0]
}

export function listRailGarments(): GarmentEntry[] {
  const rail = GARMENTS.filter((garment) => garment.rail)

  if (rail.length > 0) {
    return [...rail]
  }

  return GARMENTS.filter((garment) => garment.id === 'jacket')
}

export function garmentSrc({
  garmentId,
}: {
  garmentId?: string | null
}) {
  return getGarment({ garmentId }).src
}

export function garmentParts({
  garmentId,
}: {
  garmentId?: string | null
}) {
  return getGarment({ garmentId }).parts
}

export function garmentCredit({
  garmentId,
}: {
  garmentId?: string | null
}) {
  return getGarment({ garmentId }).credit
}

export function partLabel({ meshName }: { meshName: string }) {
  const [head] = meshName.split('-')
  const known = GARMENT_PARTS.find((part) => part.id === head)

  return known?.label ?? head.charAt(0).toUpperCase() + head.slice(1)
}
