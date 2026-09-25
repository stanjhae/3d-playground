import {
  CREATE_STEP_IDS,
  type CreateStepId,
} from './create-steps'
import { GARMENT_IDS, type GarmentId } from './design-schema'
import type { HemId, NeckId, SleeveId } from './design-document'

export type CreateSearch = {
  design?: string
  step?: CreateStepId
  garment?: GarmentId
  color?: string
  neck?: NeckId
  hem?: HemId
  sleeve?: SleeveId
}

const NECK_IDS = ['crew', 'v'] as const
const HEM_IDS = ['crop', 'long'] as const
const SLEEVE_IDS = ['short', 'long'] as const

export function parseCreateStep({
  value,
}: {
  value: unknown
}): CreateStepId | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  return CREATE_STEP_IDS.find((step) => step === value)
}

function parseGarment({
  value,
}: {
  value: unknown
}): GarmentId | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  return (GARMENT_IDS as readonly string[]).includes(value)
    ? (value as GarmentId)
    : undefined
}

function parseHexColor({
  value,
}: {
  value: unknown
}): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : undefined
}

function parseNeck({
  value,
}: {
  value: unknown
}): NeckId | undefined {
  return typeof value === 'string' &&
    (NECK_IDS as readonly string[]).includes(value)
    ? (value as NeckId)
    : undefined
}

function parseHem({
  value,
}: {
  value: unknown
}): HemId | undefined {
  return typeof value === 'string' &&
    (HEM_IDS as readonly string[]).includes(value)
    ? (value as HemId)
    : undefined
}

function parseSleeve({
  value,
}: {
  value: unknown
}): SleeveId | undefined {
  return typeof value === 'string' &&
    (SLEEVE_IDS as readonly string[]).includes(value)
    ? (value as SleeveId)
    : undefined
}

export function parseCreateSearch({
  search,
}: {
  search: Record<string, unknown>
}): CreateSearch {
  const next: CreateSearch = {}

  if (typeof search.design === 'string' && search.design.length > 0) {
    next.design = search.design
  }

  const step = parseCreateStep({ value: search.step })
  if (step) {
    next.step = step
  }

  const garment = parseGarment({ value: search.garment })
  if (garment) {
    next.garment = garment
  }

  const color = parseHexColor({ value: search.color })
  if (color) {
    next.color = color
  }

  const neck = parseNeck({ value: search.neck })
  if (neck) {
    next.neck = neck
  }

  const hem = parseHem({ value: search.hem })
  if (hem) {
    next.hem = hem
  }

  const sleeve = parseSleeve({ value: search.sleeve })
  if (sleeve) {
    next.sleeve = sleeve
  }

  return next
}

export function createStudioSearch({
  step,
  design,
  garment,
  color,
  neck,
  hem,
  sleeve,
}: CreateSearch = {}): CreateSearch {
  return {
    ...(design ? { design } : {}),
    ...(step ? { step } : {}),
    ...(garment ? { garment } : {}),
    ...(color ? { color } : {}),
    ...(neck ? { neck } : {}),
    ...(hem ? { hem } : {}),
    ...(sleeve ? { sleeve } : {}),
  }
}

export function createStudioHref({
  step,
  design,
  garment,
  color,
  neck,
  hem,
  sleeve,
}: CreateSearch = {}) {
  const params = new URLSearchParams()
  const search = createStudioSearch({
    step,
    design,
    garment,
    color,
    neck,
    hem,
    sleeve,
  })

  if (search.step) {
    params.set('step', search.step)
  }

  if (search.design) {
    params.set('design', search.design)
  }

  if (search.garment) {
    params.set('garment', search.garment)
  }

  if (search.color) {
    params.set('color', search.color)
  }

  if (search.neck) {
    params.set('neck', search.neck)
  }

  if (search.hem) {
    params.set('hem', search.hem)
  }

  if (search.sleeve) {
    params.set('sleeve', search.sleeve)
  }

  const query = params.toString()
  return query.length > 0 ? `/create?${query}` : '/create'
}
