import type {
  HemId,
  NeckId,
  PanelId,
  SleeveId,
  StructuralParams,
} from './design-document.ts'
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

export type GarmentPanel = {
  id: PanelId
  label: string
}

export type StructuralFieldId = 'neck' | 'hem' | 'sleeve'

export type StructuralField = {
  id: StructuralFieldId
  label: string
  options: readonly { id: NeckId | HemId | SleeveId; label: string }[]
}

export type GarmentEntry = {
  id: GarmentId
  label: string
  src: string
  parts: readonly GarmentPart[]
  rail: boolean
  credit?: GarmentCredit
  panels?: readonly GarmentPanel[]
  structural?: readonly StructuralField[]
  variants?: Partial<Record<NeckId, string>>
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

const TEE_PANELS: readonly GarmentPanel[] = [
  { id: 'front', label: HOUSE_COPY.front },
  { id: 'back', label: HOUSE_COPY.back },
  { id: 'left', label: HOUSE_COPY.left },
  { id: 'right', label: HOUSE_COPY.right },
]

const TEE_STRUCTURE: readonly StructuralField[] = [
  {
    id: 'neck',
    label: 'Neck',
    options: [
      { id: 'crew', label: 'Crew' },
      { id: 'v', label: 'V' },
    ],
  },
  {
    id: 'hem',
    label: 'Hem',
    options: [
      { id: 'crop', label: HOUSE_COPY.cropHem },
      { id: 'long', label: HOUSE_COPY.longHem },
    ],
  },
  {
    id: 'sleeve',
    label: HOUSE_COPY.sleeve,
    options: [
      { id: 'short', label: HOUSE_COPY.shortSleeve },
      { id: 'long', label: HOUSE_COPY.longSleeve },
    ],
  },
]

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
    id: 'tee',
    label: 'Tee',
    src: '/models/tee.glb',
    parts: partsNamed({ ids: ['body'] }),
    rail: true,
    panels: TEE_PANELS,
    structural: TEE_STRUCTURE,
    variants: {
      crew: '/models/tee.glb',
      v: '/models/tee-v.glb',
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
  structural,
}: {
  garmentId?: string | null
  structural?: StructuralParams | null
}) {
  const garment = getGarment({ garmentId })
  const neck = structural?.neck

  if (neck && garment.variants?.[neck]) {
    return garment.variants[neck]
  }

  return garment.src
}

export function garmentPanels({
  garmentId,
}: {
  garmentId?: string | null
}) {
  return getGarment({ garmentId }).panels ?? []
}

export function garmentCanPaint({
  garmentId,
}: {
  garmentId?: string | null
}) {
  return garmentPanels({ garmentId }).length > 0
}

export function garmentStructural({
  garmentId,
}: {
  garmentId?: string | null
}) {
  return getGarment({ garmentId }).structural ?? []
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
