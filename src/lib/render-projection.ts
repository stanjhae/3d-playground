import {
  type CanonicalDocument,
  type CanonicalPanelId,
  panelIdsOf,
} from './canonical-document.ts'
import type { DesignDocument, DesignLayer, PanelId } from './design-document.ts'
import { CURRENT_TEMPLATE, type TemplateManifest, resolveTemplate } from './template-manifest.ts'

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
 *   without a source is reported in `missingAssets` and projected as a
 *   `missing` graphic with no src, which the atlas draws as a hatched
 *   placeholder at the layer's box (#154).
 * - Brush opacity rides in the stroke colour as `#rrggbbaa`, the same
 *   encoding the live stroke uses, and paint layer opacity as the layer's
 *   `opacity` (#158). The base `period` becomes the stamps' `period` (#161).
 */

export type RenderProjection = {
  document: DesignDocument
  missingAssets: string[]
}

function manifestFor({ template }: { template?: CanonicalDocument['template'] }) {
  if (!template) {
    return CURRENT_TEMPLATE
  }

  const resolved = resolveTemplate(template)
  // Unresolvable documents are refused on load (cloud-design-load.ts).
  return resolved.ok ? resolved.manifest : CURRENT_TEMPLATE
}

/**
 * UI and pointer code speak render panels; commands speak canonical.
 * Routing is the same in every version of a template; without one, the tee's.
 */
export function canonicalPanel({
  renderPanel,
  template,
}: {
  renderPanel: PanelId
  template?: CanonicalDocument['template']
}): CanonicalPanelId {
  const regions = manifestFor({ template }).regions
  return Object.keys(regions).find((panel) => regions[panel]!.renderPanel === renderPanel) ?? renderPanel
}

export function renderPanel({
  panel,
  template,
}: {
  panel: CanonicalPanelId
  template?: CanonicalDocument['template']
}): PanelId {
  return manifestFor({ template }).regions[panel]?.renderPanel ?? panel
}

/** Whether `panel` is drawn left-right reversed in the render document. */
export function rendersMirrored({
  template,
  panel,
}: {
  template: CanonicalDocument['template']
  panel: CanonicalPanelId
}) {
  return manifestFor({ template }).regions[panel]?.renderMirrorX ?? false
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

/** `#rrggbb` when opaque, else `#rrggbbaa`, as `startStroke` encodes it. */
function strokeColor({ color, opacity }: { color: string; opacity: number }) {
  if (opacity >= 1) {
    return color
  }

  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`
}

function panelAspects({ manifest }: { manifest: TemplateManifest }) {
  const regions = Object.values(manifest.regions)
  return regions.every((region) => region.surface)
    ? { panelAspects: Object.fromEntries(regions.map((region) => [region.renderPanel, region.surface!.panelAspect])) }
    : {}
}

/**
 * Where a real model stands and where its sleeves are, for the camera to fit.
 * Sleeves are keyed by side, not by region id: the sleeve presets name the
 * render side (`left` is the wearer's right, at −x), while template-built
 * regions are named for the wearer (their `left` is the wearer's left, +x,
 * and labelled so). Placing them by position keeps each view on the sleeve
 * its label names, whatever the template calls it.
 */
function modelFrameOf({ manifest }: { manifest: TemplateManifest }) {
  const bounds = manifest.geometry.bounds

  if (!bounds) {
    return {}
  }

  const sleeves: { minusX?: [number, number, number]; plusX?: [number, number, number] } = {}

  for (const panel of ['left', 'right']) {
    const center = manifest.regions[panel]?.center

    if (center) {
      sleeves[center[0] < 0 ? 'minusX' : 'plusX'] = center
    }
  }

  return { modelFrame: { min: bounds.min, max: bounds.max, sleeves } }
}

/** Template-built garments carry their own atlas rectangles; the tee uses the default. */
function panelUvOf({ manifest }: { manifest: TemplateManifest }) {
  if (manifest.geometry.kind === 'procedural') {
    return {}
  }

  const regions = Object.values(manifest.regions)
  return {
    panelUv: Object.fromEntries(regions.map((region) => [region.renderPanel, { ...region.uv }])),
    atlasSize: manifest.atlas.width,
    modelSrc: manifest.geometry.file,
    ...modelFrameOf({ manifest }),
  }
}

function flipsOf(layer: { flipX?: true; flipY?: true }) {
  return { ...(layer.flipX ? { flipX: true } : {}), ...(layer.flipY ? { flipY: true } : {}) }
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

  const panels = panelIdsOf({ document })
  const routeOf = (panel: CanonicalPanelId) => manifest.regions[panel]?.renderPanel ?? panel
  const regionOf = (panel: CanonicalPanelId) => manifest.regions[panel]

  if (base.kind !== 'solid') {
    for (const panel of panels) {
      const render = routeOf(panel)
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
          mirrored: regionOf(panel)?.renderMirrorX ?? false,
          value: { rotation: angle },
        }).rotation,
        // The picked colour at full strength: what you pick is what prints.
        opacity: 1,
        visible: true,
        period: base.period,
      })
    }
  }

  for (const panel of panels) {
    const render = routeOf(panel)
    const mirrored = regionOf(panel)?.renderMirrorX ?? false
    const region = regionOf(panel)
    const regionSurface = region?.surface
    // Template-built garments carry their rectangle, so frames and hits use it.
    const surface = regionSurface
      ? { surface: manifest.geometry.kind === 'glb' ? { ...regionSurface, uv: { ...region!.uv } } : regionSurface }
      : {}
    const place = ({ x, rotation }: { x: number; rotation: number }) =>
      mirrorToRender({ mirrored, value: { x, rotation } })

    for (const layer of document.panels[panel]?.layers ?? []) {
      const label = layer.name ? { label: layer.name } : {}
      // The editor reads the lock from here; it draws nothing differently.
      const locked = layer.locked ? { locked: true as const } : {}

      if (layer.kind === 'paint') {
        layers.push({
          id: layer.id,
          kind: 'paint',
          visible: layer.visible,
          ...(layer.opacity < 1 ? { opacity: layer.opacity } : {}),
          ...label,
          ...locked,
          strokes: layer.strokes.map((stroke) => {
            const points = []

            for (let index = 0; index < stroke.points.length; index += 2) {
              const x = stroke.points[index]!
              const p = stroke.pressures?.[index / 2]
              points.push({ x: mirrored ? 1 - x : x, y: stroke.points[index + 1]!, ...(p === undefined ? {} : { p }) })
            }

            return {
              id: stroke.id,
              panel: render,
              points,
              color: stroke.tool === 'brush' ? strokeColor(stroke) : '#000000',
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
        }

        layers.push({
          id: layer.id,
          kind: 'graphic',
          panel: render,
          src: src ?? '',
          ...(src ? {} : { missing: true as const }),
          ...place(layer),
          y: layer.y,
          scale: layer.scale,
          opacity: layer.opacity,
          visible: layer.visible,
          ...(layer.aspect !== 1 ? { aspect: layer.aspect } : {}),
          ...flipsOf(layer),
          ...surface,
          ...label,
          ...locked,
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
        ...flipsOf(layer),
        ...surface,
        ...label,
        ...locked,
      })
    }
  }

  return {
    document: {
      garmentId: manifest.garmentId as DesignDocument['garmentId'],
      garmentVersion: manifest.geometry.kind === 'procedural' ? 2 : manifest.version,
      structural: { ...manifest.geometry.structural },
      overrides:
        base.kind === 'solid' && baseColor === manifest.material.color
          ? []
          : [{ meshName: 'body', color: baseColor, roughness: 0.86, metalness: 0 }],
      ...panelAspects({ manifest }),
      ...panelUvOf({ manifest }),
      layers: layers.length > 0 ? layers : [{ id: 'paint-empty', kind: 'paint', visible: true, strokes: [] }],
    },
    missingAssets,
  }
}
