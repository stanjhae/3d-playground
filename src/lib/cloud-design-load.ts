import { validateCanonicalDocument } from './canonical-document.ts'
import { useEditorStore } from './editor-store.ts'
import { getOwnedDesign } from './flp-api/client.ts'
import { resolveTemplate } from './template-manifest.ts'

export type CloudLoadResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'unsupported' | 'error' | 'account-changed' }

/**
 * Opens an owned design's head in the studio (A05 #149): strict validation
 * and a template check, then `loadCanonical`, which resets undo. Used on
 * `/create?cloud=` and after a restore (S08 #177). `isCurrent` lets a
 * caller drop a response that arrives after it moved on.
 */
export async function loadCloudDesign({
  designId,
  isCurrent = () => true,
}: {
  designId: string
  isCurrent?: () => boolean
}): Promise<CloudLoadResult> {
  const result = await getOwnedDesign({ designId })

  if (!isCurrent()) {
    return { ok: false, reason: 'account-changed' }
  }

  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.code === 'not_found'
          ? 'missing'
          : result.code === 'account-changed'
            ? 'account-changed'
            : 'error',
    }
  }

  const checked = result.data.head
    ? validateCanonicalDocument({ value: result.data.head.content })
    : null

  if (!checked?.ok || !result.data.head) {
    return { ok: false, reason: 'error' }
  }

  if (!resolveTemplate(checked.document.template).ok) {
    return { ok: false, reason: 'unsupported' }
  }

  useEditorStore.getState().loadCanonical({
    document: checked.document,
    cloud: {
      designId: result.data.id,
      headSeq: result.data.head.seq,
      title: result.data.title,
    },
  })
  return { ok: true }
}
