import type { CanonicalDocument, CanonicalLayer } from './canonical-document.ts'
import { currentTemplateFor, resolveTemplate } from './template-manifest.ts'

export type TemplateUpgrade =
  | { ok: true; document: CanonicalDocument; changed: boolean }
  | { ok: false; reason: 'unknown-template' | 'panels-differ' }

function mirrorLayer({ layer }: { layer: CanonicalLayer }): CanonicalLayer {
  if (layer.kind === 'paint') {
    return {
      ...layer,
      strokes: layer.strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((value, index) => (index % 2 === 0 ? 1 - value : value)),
      })),
    }
  }

  return { ...layer, x: 1 - layer.x, rotation: layer.rotation === 0 ? 0 : -layer.rotation }
}

/**
 * Re-pins a design to its template's newest version, the one the studio
 * draws as the real garment (the tee's `@4` instead of the procedural
 * `@1`–`@3`). Only ever run at the user's request or for a brand-new design:
 * saved designs are never quietly remapped (docs/template-manifest.md).
 *
 * Canonical coordinates are the same on every version, except where a
 * version stored a panel in render space instead (`@1`'s back is not
 * mirrored). Those panels are mirrored so marks keep the side of the body
 * their author put them on.
 *
 * Placement numbers carry over, not looks: each version has its own panel
 * shapes and atlas (`surface`), so a mark can come out a little larger,
 * smaller or differently proportioned. That is why it is only ever the
 * user's choice, says so, and is one undo step.
 */
export function upgradeToCurrentTemplate({ document }: { document: CanonicalDocument }): TemplateUpgrade {
  const from = resolveTemplate(document.template)

  if (!from.ok) {
    return { ok: false, reason: 'unknown-template' }
  }

  const to = currentTemplateFor({ templateId: document.template.id })

  if (to.version === from.manifest.version) {
    return { ok: true, document, changed: false }
  }

  const panels = Object.keys(document.panels)

  if (panels.some((panel) => !to.regions[panel])) {
    return { ok: false, reason: 'panels-differ' }
  }

  const upgraded: CanonicalDocument = {
    ...document,
    template: { id: to.id, version: to.version },
    panels: Object.fromEntries(
      Object.keys(to.regions).map((panel) => {
        const layers = document.panels[panel]?.layers ?? []
        const flips =
          (from.manifest.regions[panel]?.renderMirrorX ?? false) !== (to.regions[panel]?.renderMirrorX ?? false)

        return [panel, { layers: flips ? layers.map((layer) => mirrorLayer({ layer })) : layers }]
      }),
    ),
  }

  return { ok: true, document: upgraded, changed: true }
}

/**
 * Whether the studio can offer to move this design onto the newest garment.
 * Cheap enough to run on every store change: it compares the pin and the
 * panel names and never builds the moved document.
 */
export function canUpgradeTemplate({ document }: { document: Pick<CanonicalDocument, 'template' | 'panels'> }) {
  const from = resolveTemplate(document.template)

  if (!from.ok) {
    return false
  }

  const to = currentTemplateFor({ templateId: document.template.id })
  return to.version !== from.manifest.version && Object.keys(document.panels).every((panel) => Boolean(to.regions[panel]))
}
