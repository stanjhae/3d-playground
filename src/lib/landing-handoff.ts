import {
  cloneDocument,
  parseDocument,
  type DesignDocument,
  type HemId,
  type NeckId,
  type SleeveId,
} from './design-document'
import type { GarmentId } from './design-schema'
import { resolveGarmentId } from './design-schema'

export const LANDING_HANDOFF_KEY = 'flv:landing-handoff'

export type LandingHandoff = {
  garmentId: GarmentId
  document: DesignDocument
  color?: string
  neck?: NeckId
  hem?: HemId
  sleeve?: SleeveId
}

function sessionStore() {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  return sessionStorage
}

export function serializeLandingHandoff({
  garmentId,
  document,
  color,
  neck,
  hem,
  sleeve,
}: LandingHandoff) {
  return JSON.stringify({
    garmentId: resolveGarmentId({ garmentId }),
    document: cloneDocument({ document }),
    ...(color ? { color } : {}),
    ...(neck ? { neck } : {}),
    ...(hem ? { hem } : {}),
    ...(sleeve ? { sleeve } : {}),
  })
}

export function parseLandingHandoff({
  value,
}: {
  value: unknown
}): LandingHandoff | null {
  if (!value) {
    return null
  }

  let record: unknown = value

  if (typeof value === 'string') {
    try {
      record = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!record || typeof record !== 'object') {
    return null
  }

  const body = record as Record<string, unknown>
  const document = parseDocument({ value: body.document })

  if (!document) {
    return null
  }

  const color =
    typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)
      ? body.color.toLowerCase()
      : undefined

  return {
    garmentId: resolveGarmentId({
      garmentId:
        typeof body.garmentId === 'string' ? body.garmentId : document.garmentId,
    }),
    document,
    ...(color ? { color } : {}),
    ...(body.neck === 'crew' || body.neck === 'v'
      ? { neck: body.neck }
      : {}),
    ...(body.hem === 'crop' || body.hem === 'long' ? { hem: body.hem } : {}),
    ...(body.sleeve === 'short' || body.sleeve === 'long'
      ? { sleeve: body.sleeve }
      : {}),
  }
}

export function writeLandingHandoff({
  garmentId,
  document,
  color,
  neck,
  hem,
  sleeve,
}: LandingHandoff) {
  const store = sessionStore()

  if (!store) {
    return false
  }

  try {
    store.setItem(
      LANDING_HANDOFF_KEY,
      serializeLandingHandoff({
        garmentId,
        document,
        color,
        neck,
        hem,
        sleeve,
      }),
    )
    return true
  } catch {
    return false
  }
}

export function consumeLandingHandoff(): LandingHandoff | null {
  const store = sessionStore()

  if (!store) {
    return null
  }

  try {
    const raw = store.getItem(LANDING_HANDOFF_KEY)
    store.removeItem(LANDING_HANDOFF_KEY)
    return parseLandingHandoff({ value: raw })
  } catch {
    return null
  }
}
