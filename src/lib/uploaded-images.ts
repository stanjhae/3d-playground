import { accountGuard } from './auth/session-store.ts'
import { type CanonicalDocument, CANONICAL_PANEL_IDS } from './canonical-document.ts'
import { assetReadUrl, uploadAsset } from './flp-api/assets.ts'
import type { FlpResult } from './flp-api/client.ts'
import { isLibraryAssetId } from './library-assets.ts'

/**
 * Editor side of uploads (S01 #170). Documents hold only asset ids; the
 * renderer draws same-origin bytes, so each ready asset's short-lived
 * signed URL is fetched once and handed to the engine as an object URL
 * (it never expires mid-session and never taints the paint canvas).
 */

export type PlacedUpload = {
  assetId: string
  /** Natural width / height. */
  aspect: number
  src: string
}

async function objectUrl({
  readUrl,
  fetchImpl,
  createUrl,
}: {
  readUrl: string
  fetchImpl: typeof fetch
  createUrl: (blob: Blob) => string
}) {
  try {
    const response = await fetchImpl(readUrl)
    return response.ok ? createUrl(await response.blob()) : null
  } catch {
    return null
  }
}

/** Upload a file and return what the studio needs to place it. */
export async function uploadForStudio({
  file,
  fetchImpl = fetch,
  createUrl = (blob) => URL.createObjectURL(blob),
}: {
  file: Blob
  fetchImpl?: typeof fetch
  createUrl?: (blob: Blob) => string
}): Promise<FlpResult<PlacedUpload>> {
  const stillSameAccount = accountGuard()
  const uploaded = await uploadAsset({ file, fetchImpl })

  if (!uploaded.ok) {
    return uploaded
  }

  const src = await objectUrl({ readUrl: uploaded.data.readUrl, fetchImpl, createUrl })

  if (!stillSameAccount()) {
    return { ok: false, code: 'account-changed', message: 'Account changed' }
  }

  if (!src) {
    return { ok: false, code: 'network', message: 'The image uploaded but could not be shown. Try again.' }
  }

  return {
    ok: true,
    data: {
      assetId: uploaded.data.assetId,
      aspect: uploaded.data.width / Math.max(1, uploaded.data.height),
      src,
    },
  }
}

/** Uploaded (non-library) asset ids a document draws. */
export function uploadedAssetIds({ document }: { document: CanonicalDocument }) {
  const ids = new Set<string>()

  for (const panel of CANONICAL_PANEL_IDS) {
    for (const layer of document.panels[panel].layers) {
      if (layer.kind === 'image' && !isLibraryAssetId({ assetId: layer.assetId })) {
        ids.add(layer.assetId)
      }
    }
  }

  return [...ids]
}

/** Resolve uploaded images of an opened cloud design to drawable sources. */
export async function resolveUploadedSources({
  document,
  known = {},
  fetchImpl = fetch,
  createUrl = (blob) => URL.createObjectURL(blob),
}: {
  document: CanonicalDocument
  known?: Record<string, string>
  fetchImpl?: typeof fetch
  createUrl?: (blob: Blob) => string
}) {
  const sources: Record<string, string> = {}

  await Promise.all(
    uploadedAssetIds({ document })
      .filter((assetId) => !known[assetId])
      .map(async (assetId) => {
        const ready = await assetReadUrl({ assetId, fetchImpl })

        if (!ready.ok) {
          return
        }

        const src = await objectUrl({ readUrl: ready.data.readUrl, fetchImpl, createUrl })

        if (src) {
          sources[assetId] = src
        }
      }),
  )

  return sources
}
