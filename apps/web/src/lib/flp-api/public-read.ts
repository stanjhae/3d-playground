import type { BoardWindow } from './contract.ts'
import type { BoardEntry, PublicDesign, PublicProfile } from './publication.ts'

export type PublicReadFailure = 'not_found' | 'unavailable' | 'network'

/**
 * Anonymous read of a published design (P04 #182); no session needed. Kept
 * apart from the signed-in client so the public page doesn't load it.
 */
export async function getPublicDesign({
  slug,
  fetchImpl = fetch,
}: {
  slug: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; data: PublicDesign } | { ok: false; code: PublicReadFailure }> {
  try {
    const response = await fetchImpl(`/api/flp/public/${encodeURIComponent(slug)}`)

    if (response.ok) {
      return { ok: true, data: (await response.json()) as PublicDesign }
    }

    // Only a 404 means the design isn't public. Anything else is the service
    // having a problem, which must not read as the design being taken down.
    return { ok: false, code: response.status === 404 ? 'not_found' : 'unavailable' }
  } catch {
    return { ok: false, code: 'network' }
  }
}

/**
 * The board (V2), ranked by counted votes in `window`, within `garmentId`
 * when given; no session needed.
 */
export async function getBoard({
  window = 'all',
  garmentId = null,
  fetchImpl = fetch,
}: {
  window?: BoardWindow
  garmentId?: string | null
  fetchImpl?: typeof fetch
} = {}): Promise<{ ok: true; data: BoardEntry[] } | { ok: false; code: 'unavailable' | 'network' }> {
  const query = new URLSearchParams()

  if (window !== 'all') query.set('window', window)
  if (garmentId) query.set('garment', garmentId)

  try {
    const response = await fetchImpl(`/api/flp/public${query.size ? `?${query}` : ''}`)

    if (response.ok) {
      return { ok: true, data: ((await response.json()) as { designs: BoardEntry[] }).designs }
    }

    return { ok: false, code: 'unavailable' }
  } catch {
    return { ok: false, code: 'network' }
  }
}

/** A public profile (`/u/:handle`); no session needed. */
export async function getPublicProfile({
  handle,
  fetchImpl = fetch,
}: {
  handle: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; data: PublicProfile } | { ok: false; code: PublicReadFailure }> {
  try {
    const response = await fetchImpl(`/api/flp/public/u/${encodeURIComponent(handle)}`)

    if (response.ok) {
      return { ok: true, data: (await response.json()) as PublicProfile }
    }

    return { ok: false, code: response.status === 404 ? 'not_found' : 'unavailable' }
  } catch {
    return { ok: false, code: 'network' }
  }
}
