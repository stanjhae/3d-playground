import { accountGuard } from '../auth/session-store.ts'
import { IMAGE_LIMITS, type ImageMimeType } from '../image-validate.ts'
import { type FlpResult, call } from './client.ts'
import type { AssetReservation, AssetResponse } from './contract.ts'

/**
 * Browser side of the upload lifecycle (S01 #170): reserve a staged asset,
 * PUT the original to its signed URL, then ask the server to validate and
 * normalize it. Resolves once the asset is `ready`, with a short-lived
 * signed URL to render it; documents store only `assetId`.
 *
 * A failed upload leaves a staged row the server can reclaim; the caller
 * simply retries with a fresh reservation.
 */

export type UploadedAsset = {
  assetId: string
  mimeType: ImageMimeType
  width: number
  height: number
  readUrl: string
  /** Epoch ms after which `readUrl` should be refreshed with `assetReadUrl`. */
  readUrlExpiresAt: number
}

function ready({ response }: { response: Extract<AssetResponse, { status: 'ready' }> }): UploadedAsset {
  return {
    assetId: response.assetId,
    mimeType: response.mimeType,
    width: response.width,
    height: response.height,
    readUrl: response.readUrl,
    // Refresh a little early so a render never starts on an expiring URL.
    readUrlExpiresAt: Date.now() + (response.readUrlExpiresIn - 30) * 1000,
  }
}

export async function uploadAsset({
  file,
  fetchImpl = fetch,
}: {
  file: Blob
  fetchImpl?: typeof fetch
}): Promise<FlpResult<UploadedAsset>> {
  if (file.size > IMAGE_LIMITS.maxBytes) {
    return { ok: false, code: 'too_large', message: 'Images must be 10 MB or smaller', reason: 'too_large' }
  }

  const stillSameAccount = accountGuard()
  const reserved = await call<AssetReservation>({ path: 'assets', method: 'POST', fetchImpl })

  if (!reserved.ok) {
    return reserved
  }

  let uploaded: Response

  try {
    uploaded = await fetchImpl(reserved.data.upload.url, {
      method: 'PUT',
      // The server sniffs the bytes; this only satisfies the bucket's MIME
      // allowlist so an unsupported file reaches finalize and gets a reason.
      headers: { 'Content-Type': file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png' },
      body: file,
    })
  } catch {
    return stillSameAccount()
      ? { ok: false, code: 'network', message: 'Could not upload the image' }
      : { ok: false, code: 'account-changed', message: 'Account changed' }
  }

  if (!stillSameAccount()) {
    return { ok: false, code: 'account-changed', message: 'Account changed' }
  }

  if (!uploaded.ok) {
    return { ok: false, code: 'network', message: 'Could not upload the image' }
  }

  const finalized = await call<AssetResponse>({
    path: `assets/${reserved.data.assetId}/finalize`,
    method: 'POST',
    fetchImpl,
  })

  if (!finalized.ok) {
    return finalized
  }

  return finalized.data.status === 'ready'
    ? { ok: true, data: ready({ response: finalized.data }) }
    : { ok: false, code: 'internal', message: 'The image was not processed' }
}

/** Status of an owned asset, with a fresh signed read URL once ready. */
export async function assetReadUrl({
  assetId,
  fetchImpl,
}: {
  assetId: string
  fetchImpl?: typeof fetch
}): Promise<FlpResult<UploadedAsset>> {
  const result = await call<AssetResponse>({ path: `assets/${assetId}`, fetchImpl })

  if (!result.ok) {
    return result
  }

  return result.data.status === 'ready'
    ? { ok: true, data: ready({ response: result.data }) }
    : { ok: false, code: 'invalid', message: 'This image is not ready' }
}
