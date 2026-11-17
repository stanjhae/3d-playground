import { CANONICAL_LIMITS, type CanonicalDocument, type CanonicalLayer } from './canonical-document.ts'
import { type TemplateManifest, currentTemplateFor, resolveTemplate } from './template-manifest.ts'

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

  if (layer.kind === 'fill') {
    return {
      ...layer,
      rotation: layer.rotation === 0 ? 0 : -layer.rotation,
      ...(layer.offsetX === undefined ? {} : { offsetX: 1 - layer.offsetX }),
    }
  }

  return { ...layer, x: 1 - layer.x, rotation: layer.rotation === 0 ? 0 : -layer.rotation }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * How one panel's marks map from one version to another so they keep their
 * real size and place on the cloth, or null when that can't be known.
 *
 * Sizes are fractions of atlas width, so a mark's size on the cloth is its
 * atlas pixels over the panel's pixels per centimetre. Versions baked from
 * the same garment (equal geometry bounds, so equal panel heights) give
 * pixels per centimetre from each panel's atlas height alone; the panel's
 * true width-to-height ratio (`surface.panelAspect`) then gives its width.
 * - `size`: multiply object scales, `scaleY` and stroke widths by it.
 * - `across`: x moves about the panel's middle by it (wider panel, smaller
 *   share), and a fill's repeat (a fraction of panel width) with it.
 */
export function physicalMapping({
  from,
  to,
  panel,
}: {
  from: TemplateManifest
  to: TemplateManifest
  panel: string
}): { size: number; across: number } | null {
  const a = from.regions[panel]
  const b = to.regions[panel]
  const sameGarment =
    from.geometry.kind === 'glb' &&
    to.geometry.kind === 'glb' &&
    from.geometry.bounds !== undefined &&
    to.geometry.bounds !== undefined &&
    [0, 1, 2].every(
      (axis) =>
        Math.abs(from.geometry.bounds!.min[axis]! - to.geometry.bounds!.min[axis]!) < 0.002 &&
        Math.abs(from.geometry.bounds!.max[axis]! - to.geometry.bounds!.max[axis]!) < 0.002,
    )

  if (!sameGarment || !a?.surface || !b?.surface) {
    return null
  }

  const pixelsPerHeight = (manifest: TemplateManifest, region: typeof a) => (region.uv.v1 - region.uv.v0) * manifest.atlas.height
  const size = (pixelsPerHeight(to, b) / pixelsPerHeight(from, a)) * (from.atlas.width / to.atlas.width)
  const across = a.surface.panelAspect / b.surface.panelAspect
  return Math.abs(size - 1) < 1e-6 && Math.abs(across - 1) < 1e-6 ? null : { size, across }
}

function keepPhysical({ layer, size, across }: { layer: CanonicalLayer; size: number; across: number }): CanonicalLayer {
  const x = (value: number) => clamp(0.5 + (value - 0.5) * across, 0, 1)
  const scale = (value: number) => clamp(value * size, 1e-4, CANONICAL_LIMITS.maxObjectScale)

  if (layer.kind === 'paint') {
    return {
      ...layer,
      strokes: layer.strokes.map((stroke) => ({
        ...stroke,
        width: clamp(stroke.width * size, CANONICAL_LIMITS.minStrokeWidth, CANONICAL_LIMITS.maxStrokeWidth),
        points: stroke.points.map((value, index) => (index % 2 === 0 ? x(value) : value)),
      })),
    }
  }

  if (layer.kind === 'fill') {
    return { ...layer, tile: clamp(layer.tile * across, CANONICAL_LIMITS.minFillTile, CANONICAL_LIMITS.maxFillTile) }
  }

  const scaled = scale(layer.scale)
  const moved = { ...layer, x: x(layer.x), scale: scaled }

  if (layer.scaleY === undefined) {
    return moved
  }

  const scaleY = scale(layer.scaleY)
  // Back to uniform if the two now round to the same (a writer omits it then).
  if (scaleY === scaled) {
    const { scaleY: _same, ...uniform } = moved
    return uniform
  }

  return { ...moved, scaleY }
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
 * Between versions of the same garment (the real tee's `@4`, `@5`, `@6`)
 * marks keep their real size and place on the cloth (`physicalMapping`):
 * a wider panel or a coarser atlas would otherwise show them larger, or
 * nearer the sides. From older procedural versions placement numbers carry
 * over as they are, so a mark can come out a little larger, smaller or
 * differently proportioned. Either way it is only ever the user's choice,
 * says so, and is one undo step.
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

        const mapping = physicalMapping({ from: from.manifest, to, panel })
        const placed = mapping ? layers.map((layer) => keepPhysical({ layer, ...mapping })) : layers

        return [panel, { layers: flips ? placed.map((layer) => mirrorLayer({ layer })) : placed }]
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

/**
 * Whether moving this design to the newest version keeps every mark's real
 * size and place (versions of the same garment), so the offer can say so.
 */
export function upgradeKeepsSize({ document }: { document: Pick<CanonicalDocument, 'template' | 'panels'> }) {
  const from = resolveTemplate(document.template)

  if (!from.ok) {
    return false
  }

  const to = currentTemplateFor({ templateId: document.template.id })
  return Object.keys(document.panels).every(
    (panel) =>
      physicalMapping({ from: from.manifest, to, panel }) !== null ||
      // Nothing to map: the panel is already the same on both.
      (from.manifest.regions[panel]?.surface !== undefined &&
        JSON.stringify(from.manifest.regions[panel]?.uv) === JSON.stringify(to.regions[panel]?.uv)),
  )
}
