import { createEmptyCanonicalDocument } from './canonical-document.ts'
import { createEmptyDocument, type DesignDocument, type PanelId, type Stroke } from './design-document.ts'
import { layerBox, panelTrueAspect } from './layer-hit.ts'
import { convertLegacyDesign } from './legacy-import.ts'
import { LIBRARY_ASSET_SOURCES } from './library-assets.ts'
import { toRenderDocument } from './render-projection.ts'
import { SELECTION_COLOR } from './selection-chrome.ts'
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

/** Where a render panel's marks live in the sketch, and whether x runs the other way. */
export type LandingPanelRoute = { panel: PanelId; mirrored: boolean }

const SKETCH_PANELS: readonly PanelId[] = ['front', 'back', 'left', 'right']
const PROBE_X = 0.2
let routes: Record<PanelId, LandingPanelRoute> | null = null

/**
 * How a point picked on the 3D tee (a render panel) maps back into the
 * sketch the store keeps. Found by sending one mark per sketch panel through
 * the same conversion the hero draws with, so it can't drift from it: the
 * panels are renamed for the template and some are mirrored (`renderMirrorX`).
 */
export function landingPanelRoutes(): Record<PanelId, LandingPanelRoute> {
  if (routes) {
    return routes
  }

  const probe: DesignDocument = {
    ...createEmptyDocument({ garmentId: 'tee' }),
    layers: SKETCH_PANELS.map((panel) => ({
      id: `probe-${panel}`,
      kind: 'graphic' as const,
      panel,
      src: '/graphics/cross-gothic.svg',
      x: PROBE_X,
      y: 0.5,
      scale: 0.2,
      rotation: 0,
      opacity: 1,
      visible: true,
    })),
  }
  const found: Record<PanelId, LandingPanelRoute> = {}

  for (const layer of landingRenderDocument({ document: probe }).layers) {
    if (layer.kind === 'graphic' && layer.id.startsWith('probe-')) {
      found[layer.panel] = { panel: layer.id.slice('probe-'.length), mirrored: Math.abs(layer.x - PROBE_X) > 0.01 }
    }
  }

  routes = found
  return found
}

/** A point on a render panel, in the sketch's own panel and x. */
export function toSketchPoint({ panel, x, y }: { panel: PanelId; x: number; y: number }) {
  const route = landingPanelRoutes()[panel] ?? { panel, mirrored: false }
  return { panel: route.panel, x: route.mirrored ? 1 - x : x, y }
}

const SELECTION_FRAME_WIDTH = 0.012
/** The pad's brush, so ink drawn on the tee matches ink drawn on the pad. */
export const LANDING_BRUSH_WIDTH = 18 / 400

/**
 * The hero's render document with what isn't part of the sketch drawn on
 * top: a frame round the picked logo, and the stroke being drawn on the tee.
 */
export function withLandingOverlays({
  document,
  selectedLayerId,
  liveStroke,
}: {
  document: DesignDocument
  selectedLayerId?: string | null
  liveStroke?: { panel: PanelId; points: { x: number; y: number }[]; color: string } | null
}): DesignDocument {
  const strokes: Stroke[] = []
  const selected = selectedLayerId
    ? document.layers.find((layer) => layer.id === selectedLayerId && layer.kind === 'graphic')
    : undefined

  if (selected?.kind === 'graphic') {
    const box = layerBox({ layer: selected })
    const aspect = panelTrueAspect({ layer: selected })
    const cos = Math.cos(selected.rotation)
    const sin = Math.sin(selected.rotation)
    // A little outside the mark, so the frame never covers it.
    const halfX = (box.width / 2) * 1.12 * aspect
    const halfY = (box.height / 2) * 1.12
    const corners = [
      [-halfX, -halfY],
      [halfX, -halfY],
      [halfX, halfY],
      [-halfX, halfY],
      [-halfX, -halfY],
    ] as const

    strokes.push({
      id: 'landing-selection-frame',
      panel: selected.panel,
      points: corners.map(([localX, localY]) => ({
        x: selected.x + (localX * cos - localY * sin) / aspect,
        y: selected.y + localX * sin + localY * cos,
      })),
      color: SELECTION_COLOR,
      width: SELECTION_FRAME_WIDTH,
      tool: 'brush',
    })
  }

  if (liveStroke && liveStroke.points.length > 0) {
    strokes.push({
      id: 'landing-live-stroke',
      panel: liveStroke.panel,
      points: liveStroke.points,
      color: liveStroke.color,
      width: LANDING_BRUSH_WIDTH,
      tool: 'brush',
    })
  }

  if (strokes.length === 0) {
    return document
  }

  return { ...document, layers: [...document.layers, { id: 'landing-overlay', kind: 'paint', visible: true, strokes }] }
}
