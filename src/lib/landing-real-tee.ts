import { createEmptyCanonicalDocument } from './canonical-document.ts'
import type { DesignDocument } from './design-document.ts'
import { convertLegacyDesign } from './legacy-import.ts'
import { LIBRARY_ASSET_SOURCES } from './library-assets.ts'
import { toRenderDocument } from './render-projection.ts'
import { upgradeToCurrentTemplate } from './template-upgrade.ts'

/**
 * The landing hero's sketch on the studio's real 3D tee (`@4`), so the demo
 * shows the same garment a new design opens on. The sketch converts as a
 * landing handoff does (legacy import, then the template upgrade); anything
 * that won't convert falls back to the bare real tee rather than the drawn one.
 */
export function landingRenderDocument({ document }: { document?: DesignDocument }): DesignDocument {
  if (document) {
    const converted = convertLegacyDesign({ value: { ...document, garmentId: 'tee' } })

    if (converted.ok) {
      const upgraded = upgradeToCurrentTemplate({ document: converted.document })

      if (upgraded.ok) {
        // Library graphics import as asset ids; the hero has no uploads, and an
        // inline image the sketch carried is left to the studio to upload.
        return toRenderDocument({ document: upgraded.document, assetSources: LIBRARY_ASSET_SOURCES }).document
      }
    }
  }

  return toRenderDocument({ document: createEmptyCanonicalDocument() }).document
}
