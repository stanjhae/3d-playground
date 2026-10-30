import {
  type CanonicalDocument,
  type CanonicalPanelId,
  CANONICAL_PANEL_IDS,
} from './canonical-document.ts'
import type { DesignDocument, DesignLayer, PanelId } from './design-document.ts'
import { TEE_CREW_SHORT_V1 } from './template-manifest.ts'

/**
 * The single interim conversion (FLP E01 #152): canonical v2 → the v1
 * `DesignDocument` shape that the current atlas, paint canvas and layer UI
 * read. It goes away when R01 #164 renders from v2 directly.
 *
 * - Panels go through the template manifest, so canonical (wearer) `left`
 *   lands on the render panel that sleeve actually uses.
 * - Images need their bytes: `assetSources` maps asset id → src. An image
 *   without a source is skipped and reported, never drawn as a placeholder.
 * - Known gaps until R01/E10: base stripe/check period, brush and layer
 *   opacity, and image aspect (v1 stamps images square).
 */

export type RenderProjection = {
  document: DesignDocument
  missingAssets: string[]
}

const RENDER_BY_CANONICAL = Object.fromEntries(
  CANONICAL_PANEL_IDS.map((panel) => [
    panel,
    TEE_CREW_SHORT_V1.regions[panel].renderPanel,
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

export function toRenderDocument({
  document,
  assetSources = {},
}: {
  document: CanonicalDocument
  assetSources?: Record<string, string>
}): RenderProjection {
  const { base } = document
  const baseColor = base.kind === 'solid' ? base.color : base.colors[0]
  const layers: DesignLayer[] = []
  const missingAssets: string[] = []

  if (base.kind !== 'solid') {
    for (const panel of CANONICAL_PANEL_IDS) {
      const render = RENDER_BY_CANONICAL[panel]
      layers.push({
        id: `base-fill-${render}`,
        kind: 'pattern',
        patternId: base.kind === 'stripes' ? 'stripe' : 'check',
        panel: render,
        color: base.colors[1],
        x: 0.5,
        y: 0.5,
        scale: 1.05,
        rotation: base.kind === 'stripes' ? base.angle : 0,
        opacity: 0.55,
        visible: true,
      })
    }
  }

  for (const panel of CANONICAL_PANEL_IDS) {
    const render = RENDER_BY_CANONICAL[panel]

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
              points.push({ x: stroke.points[index]!, y: stroke.points[index + 1]! })
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
          x: layer.x,
          y: layer.y,
          scale: layer.scale,
          rotation: layer.rotation,
          opacity: layer.opacity,
          visible: layer.visible,
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
        x: layer.x,
        y: layer.y,
        scale: layer.scale,
        rotation: layer.rotation,
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
      structural: { ...TEE_CREW_SHORT_V1.geometry.structural },
      overrides:
        base.kind === 'solid' && baseColor === TEE_CREW_SHORT_V1.material.color
          ? []
          : [{ meshName: 'body', color: baseColor, roughness: 0.86, metalness: 0 }],
      layers: layers.length > 0 ? layers : [{ id: 'paint-empty', kind: 'paint', visible: true, strokes: [] }],
    },
    missingAssets,
  }
}
