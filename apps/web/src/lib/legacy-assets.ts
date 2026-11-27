import type { CanonicalDocument, CanonicalLayer } from './canonical-document.ts'
import { type UploadedAsset, uploadAsset } from './flp-api/assets.ts'
import type { FlpResult } from './flp-api/client.ts'
import type { ImportNote, PendingAsset } from './legacy-import.ts'

/**
 * Landing images are data URLs, which the CSP keeps out of `fetch`
 * (`connect-src` allows `blob:` but not `data:`), so they are decoded here.
 */
export async function sourceToBlob(src: string): Promise<Blob> {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(src)

  if (!match) {
    return (await fetch(src)).blob()
  }

  const [, type, base64, data] = match
  const bytes = base64
    ? Uint8Array.from(atob(data!), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(data!))
  return new Blob([bytes], { type: type || 'application/octet-stream' })
}

/**
 * Uploads the images a legacy design carried inline (F06 #141) and points
 * its image layers at the real asset ids. The server refuses a design that
 * references an image that was never uploaded, so a failed upload leaves
 * that image out, with a note saying so. `partial` keeps the failed images
 * (and `failed` lists them) so a retry uploads only those.
 */
export async function uploadPendingAssets({
  document,
  pendingAssets,
  upload = (file) => uploadAsset({ file }),
  toBlob = sourceToBlob,
}: {
  document: CanonicalDocument
  pendingAssets: PendingAsset[]
  upload?: (file: Blob) => Promise<FlpResult<UploadedAsset>>
  toBlob?: (src: string) => Promise<Blob>
}): Promise<{
  document: CanonicalDocument
  notes: ImportNote[]
  uploaded: UploadedAsset[]
  partial: CanonicalDocument
  failed: Array<PendingAsset & { reason: string }>
}> {
  const replaced = new Map<string, string>()
  const failed = new Map<string, string>()
  const uploaded: UploadedAsset[] = []

  for (const pending of pendingAssets) {
    try {
      const result = await upload(await toBlob(pending.src))

      if (result.ok) {
        replaced.set(pending.assetId, result.data.assetId)
        uploaded.push(result.data)
      } else {
        failed.set(pending.assetId, result.message)
      }
    } catch {
      failed.set(pending.assetId, 'the image could not be read')
    }
  }

  const partial = structuredClone(document)

  for (const panel of Object.values(partial.panels)) {
    panel.layers = panel.layers.map((layer) => {
      const assetId = layer.kind === 'image' ? replaced.get(layer.assetId) : undefined
      return assetId && layer.kind === 'image' ? { ...layer, assetId } : layer
    })
  }

  const next = structuredClone(partial)
  const notes: ImportNote[] = []

  for (const [panelId, panel] of Object.entries(next.panels)) {
    panel.layers = panel.layers.flatMap((layer, index): CanonicalLayer[] => {
      const reason = layer.kind === 'image' ? failed.get(layer.assetId) : undefined

      if (reason) {
        notes.push({ path: `$.panels.${panelId}.layers[${index}]`, message: `an image could not be uploaded (${reason}) and was left out` })
        return []
      }

      return [layer]
    })
  }

  return {
    document: next,
    notes,
    uploaded,
    partial,
    failed: pendingAssets.flatMap((pending) => {
      const reason = failed.get(pending.assetId)
      return reason ? [{ ...pending, reason }] : []
    }),
  }
}
