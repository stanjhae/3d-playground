import type { DesignDocument } from './design-document'
import { TEMPLATE_IDS, resolveTemplate } from './template-manifest'

/** The cloth of a garment with no template and no colour of its own. */
export const DEFAULT_CLOTH_COLOR = '#f3efe6'

/**
 * The colour of the bare cloth, as the 3D garment draws it (tester pass 3).
 * A design's garment colour (for stripes or a check, their ground) reaches
 * the 3D model as its `body` override; with none, the model shows its
 * template's own material colour. The flat panels paint their ink over this
 * same colour, so the 2D and the 3D always agree. They used to paint a
 * fixed cream, so a striped ground showed cream in 2D and its real colour
 * in 3D.
 */
export function clothColorOf({ document }: { document: Pick<DesignDocument, 'garmentId' | 'garmentVersion' | 'overrides'> }) {
  const body = document.overrides.findLast((override) => override.meshName === 'body' && override.color)

  if (body?.color) {
    return body.color
  }

  return templateMaterialColor({ garmentId: document.garmentId, garmentVersion: document.garmentVersion }) ?? DEFAULT_CLOTH_COLOR
}

/** The material colour of the template a render document was projected from. */
function templateMaterialColor({ garmentId, garmentVersion }: { garmentId: string; garmentVersion: number }) {
  for (const id of TEMPLATE_IDS) {
    const resolved = resolveTemplate({ id, version: garmentVersion })

    if (resolved.ok && resolved.manifest.garmentId === garmentId) {
      return resolved.manifest.material.color
    }
  }

  return null
}
