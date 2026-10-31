import type { PublicDesign } from './publication.ts'

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
}): Promise<{ ok: true; data: PublicDesign } | { ok: false; code: 'not_found' | 'network' }> {
  try {
    const response = await fetchImpl(`/api/flp/public/${encodeURIComponent(slug)}`)
    return response.ok
      ? { ok: true, data: (await response.json()) as PublicDesign }
      : { ok: false, code: 'not_found' }
  } catch {
    return { ok: false, code: 'network' }
  }
}
