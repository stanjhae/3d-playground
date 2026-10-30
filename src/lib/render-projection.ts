import {
  type CanonicalDocument,
  type CanonicalPanelId,
  CANONICAL_PANEL_IDS,
} from './canonical-document.ts'
import type { DesignDocument, DesignLayer, PanelId } from './design-document.ts'
import { CURRENT_TEMPLATE, resolveTemplate } from './template-manifest.ts'

/**
 * The single interim conversion (FLP E01 #152): canonical v2 → the v1
 * `DesignDocument` shape that the current atlas, paint canvas and layer UI
 * read. It goes away when R01 #164 renders from v2 directly.
 *
 * - Panels go through the template manifest, so canonical (wearer) `left`
 *   lands on the render panel that sleeve actually uses.
 * - The document's own template version decides how each panel's x maps:
 *   on @2 the back is mirrored (render x = 1 − x, rotation = −rotation) so
 *   the 2D canvas shows it as seen from behind; @1 documents keep the
 *   back exactly as stored (R02 #165). `mirrorToRender` is its own
 *   inverse, and the editor uses it to map render-space input back.
 * - Images need their bytes: `assetSources` maps asset id → src. An image
 *   without a source is skipped and reported, never drawn as a placeholder.
 * - Known gaps until R01/E10: base stripe/check period, brush and layer
 *   opacity, and image aspect (v1 stamps images square).
 */

export type RenderProjection = {
  document: DesignDocument
  missingAssets: string[]
}

// Panel routing is the same in every template version.
const RENDER_BY_CANONICAL = Object.fromEntries(
  CANONICAL_PANEL_IDS.map((panel) => [
    panel,
    CURRENT_TEMPLATE.regions[panel].renderPanel,
  ]),
) as Record<CanonicalPanelId, PanelId>

const CANONICAL_BY_RENDER = Object.fromEntries(
  CANONICAL_PANEL_IDS.map((panel) => [RENDER_BY_CANONICAL[panel], panel]),
) as Record<PanelId, CanonicalPanelId>

/** UI and pointer code speak render panels; commands speak canonical. */
export function canonicalPanel({ renderPanel }: { renderPanel: PanelId }) {
  return CANONICAL_BY_RENDER[renderPanel]
}

export function renderPanel({ panel }: { panel: CanonicalPanelId }) {
  return RENDER_BY_CANONICAL[panel]
}

function manifestFor({ template }: { template: CanonicalDocument['template'] }) {
  const resolved = resolveTemplate(template)
  // Unresolvable documents are refused on load (cloud-design-load.ts).
  return resolved.ok ? resolved.manifest : CURRENT_TEMPLATE
}

/** Whether `panel` is drawn left-right reversed in the render document. */
export function rendersMirrored({
  template,
  panel,
}: {
  template: CanonicalDocument['template']
  panel: CanonicalPanelId
}) {
  return manifestFor({ template }).regions[panel].renderMirrorX
}

/**
 * Map a panel position between canonical and render space. Mirroring is
 * an involution, so the same call converts either way.
 */
export function mirrorToRender<T extends { x?: number; rotation?: number }>({
  mirrored,
  value,
}: {
  mirrored: boolean
  value: T
}): T {
  if (!mirrored) {
    return value
  }

  return {
    ...value,
    ...(value.x !== undefined ? { x: 1 - value.x } : {}),
    // `0 - r` rather than `-r` so an unrotated layer stays 0, not −0.
    ...(value.rotation !== undefined ? { rotation: 0 - value.rotation } : {}),
  }
}

export function toRenderDocument({
  document,
  assetSources = {},
}: {
  document: CanonicalDocument
  assetSources?: Record<string, string>
}): RenderProjection {
  const { base } = document
  const manifest = manifestFor({ template: document.template })
  const baseColor = base.kind === 'solid' ? base.color : base.colors[0]
  const layers: DesignLayer[] = []
  const missingAssets: string[] = []

  if (base.kind !== 'solid') {
    for (const panel of CANONICAL_PANEL_IDS) {
      const render = RENDER_BY_CANONICAL[panel]
      const angle = base.kind === 'stripes' ? base.angle : 0
      layers.push({
        id: `base-fill-${render}`,
        kind: 'pattern',
        patternId: base.kind === 'stripes' ? 'stripe' : 'check',
        panel: render,
        color: base.colors[1],
        x: 0.5,
        y: 0.5,
        scale: 1.05,
        rotation: mirrorToRender({
          mirrored: manifest.regions[panel].renderMirrorX,
          value: { rotation: angle },
        }).rotation,
        opacity: 0.55,
        visible: true,
      })
    }
  }

  for (const panel of CANONICAL_PANEL_IDS) {
    const render = RENDER_BY_CANONICAL[panel]
    const mirrored = manifest.regions[panel].renderMirrorX
    const place = ({ x, rotation }: { x: number; rotation: number }) =>
      mirrorToRender({ mirrored, value: { x, rotation } })

    for (const layer of document.panels[panel].layers) {
      const label = layer.name ? { label: layer.name } : {}

      if (layer.kind === 'paint') {
        layers.push({
          id: layer.id,
          kind: 'paint',
          visible: layer.visible,
          ...label,
          strokes: layer.strokes.map((stroke) => {
            const points = []

            for (let index = 0; index < stroke.points.length; index += 2) {
              const x = stroke.points[index]!
              points.push({ x: mirrored ? 1 - x : x, y: stroke.points[index + 1]! })
            }

            return {
              id: stroke.id,
              panel: render,
              points,
              color: stroke.tool === 'brush' ? stroke.color : '#000000',
              width: stroke.width,
              tool: stroke.tool,
            }
          }),
        })
        continue
      }

      if (layer.kind === 'image') {
        const src = assetSources[layer.assetId]

        if (!src) {
          missingAssets.push(layer.assetId)
          continue
        }

        layers.push({
          id: layer.id,
          kind: 'graphic',
          panel: render,
          src,
          ...place(layer),
          y: layer.y,
          scale: layer.scale,
          opacity: layer.opacity,
          visible: layer.visible,
          ...(layer.aspect !== 1 ? { aspect: layer.aspect } : {}),
          ...label,
        })
        continue
      }

      layers.push({
        id: layer.id,
        kind: 'text',
        panel: render,
        content: layer.content,
        face: layer.face,
        color: layer.color,
        ...place(layer),
        y: layer.y,
        scale: layer.scale,
        opacity: layer.opacity,
        visible: layer.visible,
        ...label,
      })
    }
  }

  return {
    document: {
      garmentId: 'tee',
      garmentVersion: 2,
      structural: { ...manifest.geometry.structural },
      overrides:
        base.kind === 'solid' && baseColor === manifest.material.color
          ? []
          : [{ meshName: 'body', color: baseColor, roughness: 0.86, metalness: 0 }],
      layers: layers.length > 0 ? layers : [{ id: 'paint-empty', kind: 'paint', visible: true, strokes: [] }],
    },
    missingAssets,
  }
}
