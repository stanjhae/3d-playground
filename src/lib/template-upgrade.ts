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
 * Versions whose sleeve print runs down the arm: the tee's `@5` and `@6`
 * unrolled each sleeve about an axis found from its vertices' spread, which
 * came out pointing up, so panel y ran from the shoulder to the cuff and a
 * mark drawn upright on the flat sleeve showed upside down on the 3D one.
 * `@7` finds the axis from the sleeve's surface and runs up it again.
 */
const SLEEVES_RUN_DOWN: Readonly<Record<string, readonly number[]>> = { 'tee-crew-short': [5, 6] }

function runsDown({ manifest, panel }: { manifest: TemplateManifest; panel: string }) {
  return (panel === 'left' || panel === 'right') && (SLEEVES_RUN_DOWN[manifest.id]?.includes(manifest.version) ?? false)
}

/** `value · scale + offset`, along one panel axis. */
type AxisMap = { scale: number; offset: number }

export type PhysicalMapping = {
  /** Multiply object scales, `scaleY` and stroke widths by it. */
  size: number
  /** Where a point's panel x goes. */
  x: AxisMap
  /**
   * Where a mark's panel y goes. With `turnsOver` the panel's vertical
   * sense reverses (a sleeve that ran down the arm now runs up it): the
   * mark moves to where it sat on the cloth, but keeps its shape as drawn,
   * so it now reads the right way up on the garment too.
   */
  y: AxisMap
  turnsOver: boolean
}

const IDENTITY: AxisMap = { scale: 1, offset: 0 }
const isIdentity = ({ scale, offset }: AxisMap) => Math.abs(scale - 1) < 1e-6 && Math.abs(offset) < 1e-6

/** Whether a panel's rectangle is its frame's shape, so panel coordinates run linearly across the frame. */
function frameIsBox({ manifest, region }: { manifest: TemplateManifest; region: TemplateManifest['regions'][string] }) {
  const { frame, uv } = region
  if (!frame) return false
  const rectAspect = ((uv.u1 - uv.u0) * manifest.atlas.width) / ((uv.v1 - uv.v0) * manifest.atlas.height)
  return Math.abs(rectAspect / ((frame.x1 - frame.x0) / (frame.y1 - frame.y0)) - 1) < 0.01
}

/**
 * How one panel's marks map from one version to another so they keep their
 * real size and place on the cloth, or null when that can't be known (or
 * nothing moves).
 *
 * Sizes are fractions of atlas width, so a mark's size on the cloth is its
 * atlas pixels over the panel's pixels per centimetre.
 * - Where both versions give the panel's print-space frame (metres, from
 *   the tee's `@6`) and its rectangle has the frame's shape, the frames say
 *   exactly where each point lies on the cloth.
 * - Otherwise versions baked from the same garment (equal geometry bounds,
 *   so equal panel heights) give pixels per centimetre from each panel's
 *   atlas height alone; the panel's true width-to-height ratio
 *   (`surface.panelAspect`) then gives its width, and x moves about the
 *   panel's middle (wider panel, smaller share).
 */
export function physicalMapping({
  from,
  to,
  panel,
}: {
  from: TemplateManifest
  to: TemplateManifest
  panel: string
}): PhysicalMapping | null {
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

  const turnsOver = runsDown({ manifest: from, panel }) !== runsDown({ manifest: to, panel })
  const pixelsPerHeight = (manifest: TemplateManifest, region: typeof a) => (region.uv.v1 - region.uv.v0) * manifest.atlas.height
  let mapping: PhysicalMapping

  if (frameIsBox({ manifest: from, region: a }) && frameIsBox({ manifest: to, region: b })) {
    const [f, t] = [a.frame!, b.frame!]
    const perMetre = (manifest: TemplateManifest, region: typeof a) => pixelsPerHeight(manifest, region) / (region.frame!.y1 - region.frame!.y0)
    // A panel running down the arm has y0 at the cuff end of its frame: up
    // the arm is −y in its print space (the bake's notes and frames say so).
    const fromUp = (value: number) => (runsDown({ manifest: from, panel }) ? -1 : 1) * (f.y0 + value * (f.y1 - f.y0))
    const toY = (up: number) => ((runsDown({ manifest: to, panel }) ? -up : up) - t.y0) / (t.y1 - t.y0)
    const y0 = toY(fromUp(0))
    mapping = {
      size: (perMetre(to, b) / perMetre(from, a)) * (from.atlas.width / to.atlas.width),
      x: { scale: (f.x1 - f.x0) / (t.x1 - t.x0), offset: (f.x0 - t.x0) / (t.x1 - t.x0) },
      y: { scale: toY(fromUp(1)) - y0, offset: y0 },
      turnsOver,
    }
  } else {
    const across = a.surface.panelAspect / b.surface.panelAspect
    mapping = {
      size: (pixelsPerHeight(to, b) / pixelsPerHeight(from, a)) * (from.atlas.width / to.atlas.width),
      x: { scale: across, offset: 0.5 - 0.5 * across },
      y: turnsOver ? { scale: -1, offset: 1 } : IDENTITY,
      turnsOver,
    }
  }

  return Math.abs(mapping.size - 1) < 1e-6 && isIdentity(mapping.x) && isIdentity(mapping.y) ? null : mapping
}

function keepPhysical({ layer, mapping }: { layer: CanonicalLayer; mapping: PhysicalMapping }): CanonicalLayer {
  const { size, turnsOver } = mapping
  const x = (value: number) => clamp(value * mapping.x.scale + mapping.x.offset, 0, 1)
  const y = (value: number) => clamp(value * mapping.y.scale + mapping.y.offset, 0, 1)
  const scale = (value: number) => clamp(value * size, 1e-4, CANONICAL_LIMITS.maxObjectScale)

  if (layer.kind === 'paint') {
    // A drawing moves as one piece: where the panel turns over, its middle
    // goes where it sat on the cloth and its strokes keep their shape round
    // it (scaled with the cloth), so lettering still reads as drawn.
    const ys = layer.strokes.flatMap((stroke) => stroke.points.filter((_, index) => index % 2 === 1))
    const middle = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0.5
    const pointY = turnsOver ? (value: number) => clamp(y(middle) + (value - middle) * Math.abs(mapping.y.scale), 0, 1) : y

    return {
      ...layer,
      strokes: layer.strokes.map((stroke) => ({
        ...stroke,
        width: clamp(stroke.width * size, CANONICAL_LIMITS.minStrokeWidth, CANONICAL_LIMITS.maxStrokeWidth),
        points: stroke.points.map((value, index) => (index % 2 === 0 ? x(value) : pointY(value))),
      })),
    }
  }

  if (layer.kind === 'fill') {
    return { ...layer, tile: clamp(layer.tile * mapping.x.scale, CANONICAL_LIMITS.minFillTile, CANONICAL_LIMITS.maxFillTile) }
  }

  const scaled = scale(layer.scale)
  const moved = { ...layer, x: x(layer.x), y: y(layer.y), scale: scaled }

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
 * Between versions of the same garment (the real tee's `@4` to `@7`)
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
        const placed = mapping ? layers.map((layer) => keepPhysical({ layer, mapping })) : layers

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
