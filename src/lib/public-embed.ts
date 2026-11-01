import type { PublicDesign } from './flp-api/publication'

/** Must match `PUBLIC_PAYLOAD_ELEMENT_ID` in `flp-api/share-page.ts`. */
const ELEMENT_ID = 'flp-public'
/** Must match `STATIC_SHARE_ELEMENT_ID` in `flp-api/share-page.ts`. */
export const STATIC_SHARE_ELEMENT_ID = 'flp-static-share'

function isPublicDesign(value: unknown): value is PublicDesign {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const renders = record.renders as Record<string, unknown> | undefined

  return (
    typeof record.slug === 'string' &&
    typeof record.title === 'string' &&
    (record.displayName === null || typeof record.displayName === 'string') &&
    typeof record.seq === 'number' &&
    typeof record.publishedAt === 'string' &&
    !!renders &&
    ['view_front', 'view_three_quarter', 'view_back'].every((kind) => typeof renders[kind] === 'string')
  )
}

/**
 * The public payload the share page embedded in the HTML (#182), when it
 * belongs to `slug`. Read once: a later in-app visit fetches fresh.
 */
export function takeEmbeddedPublicDesign({
  slug,
  doc = typeof document === 'undefined' ? null : document,
}: {
  slug: string
  doc?: Pick<Document, 'getElementById'> | null
}): PublicDesign | null {
  const element = doc?.getElementById(ELEMENT_ID)

  if (!element?.textContent) {
    return null
  }

  try {
    const value: unknown = JSON.parse(element.textContent)
    element.remove?.()
    return isPublicDesign(value) && value.slug === slug ? value : null
  } catch {
    return null
  }
}
