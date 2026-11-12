import type { CanonicalPanelId, TemplateId } from './canonical-document.ts'
import type { PanelId, PanelSurface } from './design-document.ts'
import { HOODIE_V1 } from './templates/hoodie.ts'
import { TEE_CREW_SHORT_V4 } from './templates/tee-v4.ts'
import { MIXED_V1 } from './templates/mixed.ts'
import { SLIP_V1 } from './templates/slip.ts'
import { COAT_V1 } from './templates/coat.ts'
import { OVERALL_V1 } from './templates/overall.ts'
import { GOWN_V1 } from './templates/gown.ts'
import { SUIT_V1 } from './templates/suit.ts'
import { TAILORED_V1 } from './templates/tailored.ts'

/**
 * Pinned garment templates (FLP F07 #142). A canonical document names
 * `template: { id, version }`; this manifest says exactly what that means:
 * which geometry, which atlas rectangle each print panel uses, and which
 * way each panel faces. Any change to geometry or UVs is a new version;
 * saved designs keep the version they were made on. See
 * docs/template-manifest.md.
 *
 * Panels are **wearer-oriented**: `left` is the wearer's left sleeve. Panel
 * coordinates follow docs/canonical-document.md (x right, y up, [0, 1]).
 * All numbers below are derived from `src/lib/tee-geometry.ts`; the tests
 * rebuild that geometry and check them.
 */

export type UvRect = {
  u0: number
  v0: number
  u1: number
  v1: number
}

export type PanelPoint = {
  x: number
  y: number
}

export type TemplateRegion = {
  label: string
  /** Panel id the current atlas/render path (v1, `DEFAULT_PANEL_UV`) uses. */
  renderPanel: CanonicalPanelId
  /**
   * True when the render document (2D panel canvas and atlas, both drawn
   * as seen from outside the garment) shows this panel left-right
   * reversed from canonical x: render x = 1 − x, rotation = −rotation.
   * `src/lib/render-projection.ts` applies it, so stored content never
   * changes. See docs/template-manifest.md.
   */
  renderMirrorX: boolean
  mesh: string
  uv: UvRect
  /** What +x and +y mean on the garment, in wearer terms. */
  axes: { x: string; y: string }
  landmarks: Record<string, PanelPoint>
  notes: readonly string[]
  /** From `@3`: how this region lies on the cloth, measured from the mesh. */
  surface?: PanelSurface
  /** Template-built garments: where the panel sits on the model (metres), for the camera. */
  center?: [number, number, number]
}

export type TemplateManifest = {
  id: TemplateId
  version: number
  /** The garment (`garments.ts`) this template prints on. */
  garmentId: string
  orientation: 'wearer'
  geometry: {
    /**
     * `procedural`: the scene builds the mesh (`createClothingMesh`).
     * `glb`: the scene loads `file`, whose print UVs (`TEXCOORD_1`) lay
     * each panel in its `uv` rectangle (`scripts/build-template.mjs`).
     */
    kind: 'procedural' | 'glb'
    file: string
    sha256: string
    generator: string
    /**
     * Body UV layout `createClothingMesh` builds for this version. The
     * scene always builds the newest layout; older versions are projected
     * onto it through `renderMirrorX`.
     */
    uvLayout?: 1 | 2
    structural?: { neck: 'crew'; hem: 'long'; sleeve: 'short' }
    /** Template-built garments: the model's extent (metres), for the camera to fit. */
    bounds?: { min: [number, number, number]; max: [number, number, number] }
  }
  atlas: { width: number; height: number }
  material: { color: string; roughness: number; metalness: number }
  fonts: ReadonlyArray<{
    face: 'display' | 'sans'
    family: string
    package: string
    license: 'OFL-1.1'
  }>
  /** Print panels, in the order the editor lists them. */
  regions: Record<CanonicalPanelId, TemplateRegion>
}

const TORSO_V0 = 0.28

/** Front panel height above which the collar band's UVs overlap it. */
export const COLLAR_START_Y = 0.861

export const TEE_CREW_SHORT_V1: TemplateManifest = Object.freeze({
  id: 'tee-crew-short',
  version: 1,
  garmentId: 'tee',
  orientation: 'wearer',
  geometry: {
    kind: 'procedural',
    file: '/models/tee.glb',
    sha256: '50654ee6efe843f7efa2bff433e91ae53c1eb1778652acbe653d6ebe08ae8bac',
    generator: 'scripts/build-tee.mjs (createTeeMesh in src/lib/tee-geometry.ts)',
    uvLayout: 1,
    structural: { neck: 'crew', hem: 'long', sleeve: 'short' },
  },
  atlas: { width: 512, height: 512 },
  material: { color: '#f3efe6', roughness: 0.86, metalness: 0 },
  fonts: [
    {
      face: 'display',
      family: 'Cormorant Garamond',
      package: '@fontsource/cormorant-garamond',
      license: 'OFL-1.1',
    },
    { face: 'sans', family: 'Outfit', package: '@fontsource/outfit', license: 'OFL-1.1' },
  ],
  regions: {
    front: {
      label: 'Front',
      renderPanel: 'front',
      renderMirrorX: false,
      mesh: 'body',
      uv: { u0: 0, v0: TORSO_V0, u1: 0.5, v1: 1 },
      axes: {
        x: "toward the wearer's left (reads correctly from the front)",
        y: 'from hem up to neckline',
      },
      landmarks: {
        hemCentre: { x: 0.5, y: 0 },
        waistCentre: { x: 0.5, y: 0.321 },
        chestCentre: { x: 0.5, y: 0.691 },
        shoulderLine: { x: 0.5, y: 0.889 },
        neckline: { x: 0.5, y: 1 },
        wearerRightSideSeam: { x: 0, y: 0.5 },
        wearerLeftSideSeam: { x: 1, y: 0.5 },
      },
      notes: [
        `The collar band's UVs overlap this panel above y ≈ ${COLLAR_START_Y}, but the collar is trim and never takes the print (#165): marks there show on the body only.`,
      ],
    },
    back: {
      label: 'Back',
      renderPanel: 'back',
      renderMirrorX: false,
      mesh: 'body',
      uv: { u0: 0.5, v0: TORSO_V0, u1: 1, v1: 1 },
      axes: {
        x: "toward the wearer's left (mirrored when seen from behind)",
        y: 'from hem up to neckline',
      },
      landmarks: {
        hemCentre: { x: 0.5, y: 0 },
        waistCentre: { x: 0.5, y: 0.321 },
        shoulderBladeCentre: { x: 0.5, y: 0.691 },
        shoulderLine: { x: 0.5, y: 0.889 },
        neckline: { x: 0.5, y: 1 },
        wearerRightSideSeam: { x: 0, y: 0.5 },
        wearerLeftSideSeam: { x: 1, y: 0.5 },
      },
      notes: [
        'On @1 geometry the back ran the same direction as the front, so text drawn left-to-right read mirrored from behind (R02 #165, fixed in @2).',
        'Documents pinned to @1 are rendered on @2 geometry with the back as stored (no mirror): it keeps the layout its author saw on the 2D back canvas and now reads correctly from behind, on the opposite side from the old @1 render.',
      ],
    },
    left: {
      label: "Wearer's left sleeve",
      renderPanel: 'right',
      renderMirrorX: false,
      mesh: 'body-sleeve-right',
      uv: { u0: 0.5, v0: 0, u1: 1, v1: TORSO_V0 },
      axes: { x: 'around the sleeve', y: 'along the sleeve' },
      landmarks: { sleeveCentre: { x: 0.5, y: 0.5 } },
      notes: [
        "Built at +x by `buildSleeve({ side: 'right' })`; the front faces +z, so +x is the wearer's left.",
      ],
    },
    right: {
      label: "Wearer's right sleeve",
      renderPanel: 'left',
      renderMirrorX: false,
      mesh: 'body-sleeve-left',
      uv: { u0: 0, v0: 0, u1: 0.5, v1: TORSO_V0 },
      axes: { x: 'around the sleeve', y: 'along the sleeve' },
      landmarks: { sleeveCentre: { x: 0.5, y: 0.5 } },
      notes: ["Built at −x by `buildSleeve({ side: 'left' })`: the wearer's right."],
    },
  },
}) as TemplateManifest

/**
 * @2 (R02 #165): same geometry and atlas rectangles, but the back half of
 * the body unwraps u 1 → 0.5 (wearer's right → left), so its atlas
 * rectangle reads left-to-right from behind. Canonical axes are unchanged
 * and wearer-oriented: back x still runs toward the wearer's left, so the
 * render projection mirrors the back (`renderMirrorX`). The wearer's
 * right side seam is split in the mesh so no triangle spans the atlas.
 */
export const TEE_CREW_SHORT_V2: TemplateManifest = Object.freeze({
  ...TEE_CREW_SHORT_V1,
  version: 2,
  geometry: { ...TEE_CREW_SHORT_V1.geometry, uvLayout: 2 },
  regions: {
    ...TEE_CREW_SHORT_V1.regions,
    back: {
      ...TEE_CREW_SHORT_V1.regions.back,
      renderMirrorX: true,
      axes: {
        x: "toward the wearer's left, like the front; the 2D canvas and atlas show the back as seen from behind, so they run toward the wearer's right",
        y: 'from hem up to neckline',
      },
      notes: [
        'The body unwraps the back u 1 → 0.5 (wearer’s right → left), so the 2D back canvas matches the garment seen from behind and text reads correctly there.',
      ],
    },
  },
}) as TemplateManifest

/**
 * `@3` (image proportions): same geometry and mapping, but images and words
 * are drawn true to the cloth instead of to the atlas, whose rectangles don't
 * match the garment (a square measured 0.71:1 on the front, 1.70:1 on a
 * sleeve), and the 2D panels take each region's real shape. Designs pinned to
 * an older version keep the look they were made with.
 * The torso is an oval, so the cloth runs wider at its middle than its sides;
 * these numbers hold across the central half, where a print sits, and a mark
 * out towards a side seam reads narrower. `template-manifest.test.ts` checks
 * them against the mesh.
 */
export const TEE_CREW_SHORT_V3: TemplateManifest = Object.freeze({
  ...TEE_CREW_SHORT_V2,
  version: 3,
  regions: {
    front: { ...TEE_CREW_SHORT_V2.regions.front, surface: { stretchY: 0.879, panelAspect: 0.611 } },
    back: { ...TEE_CREW_SHORT_V2.regions.back, surface: { stretchY: 0.871, panelAspect: 0.605 } },
    left: { ...TEE_CREW_SHORT_V2.regions.left, surface: { stretchY: 1.701, panelAspect: 3.037 } },
    right: { ...TEE_CREW_SHORT_V2.regions.right, surface: { stretchY: 1.701, panelAspect: 3.037 } },
  },
}) as TemplateManifest

/**
 * The newest procedural tee (`@3`): what older tee documents and the tee's
 * fixed guides and landmarks are measured on. New tee designs pin `@4`,
 * the real T-shirt (`CURRENT_VERSIONS`).
 */
export const CURRENT_TEMPLATE = TEE_CREW_SHORT_V3

export { TEE_CREW_SHORT_V4 }

/**
 * Every version that saved designs may reference. Never remove entries. New
 * designs pin each template's highest version: the tee's @4 is the real
 * T-shirt (templates/tee.pieces.json); @1–@3 stay procedural.
 */
const TEMPLATE_ARCHIVE: Record<string, Record<number, TemplateManifest>> = {
  'tee-crew-short': { 1: TEE_CREW_SHORT_V1, 2: TEE_CREW_SHORT_V2, 3: TEE_CREW_SHORT_V3, 4: TEE_CREW_SHORT_V4 },
  hoodie: { 1: HOODIE_V1 },
  mixed: { 1: MIXED_V1 },
  slip: { 1: SLIP_V1 },
  coat: { 1: COAT_V1 },
  overall: { 1: OVERALL_V1 },
  gown: { 1: GOWN_V1 },
  suit: { 1: SUIT_V1 },
  tailored: { 1: TAILORED_V1 },
}

/** The version new designs pin, per template: its highest. */
const CURRENT_VERSIONS: Record<string, TemplateManifest> = Object.fromEntries(
  Object.entries(TEMPLATE_ARCHIVE).map(([id, versions]) => [id, versions[Math.max(...Object.keys(versions).map(Number))]!]),
)

export const TEMPLATE_IDS: readonly string[] = Object.freeze(Object.keys(TEMPLATE_ARCHIVE))

/** The manifest new designs on this template pin. */
export function currentTemplateFor({ templateId }: { templateId: string }): TemplateManifest {
  const manifest = CURRENT_VERSIONS[templateId]

  if (!manifest) {
    throw new Error(`Garment template "${templateId}" is not available`)
  }

  return manifest
}

/**
 * The garment a saved design is on, from its pinned template. A version this
 * build can't open still names its garment by the template id; only a design
 * with no template (from before templates were pinned) is a tee.
 */
export function garmentOfTemplate({ id, version }: { id: string | null | undefined; version: number | string | null | undefined }) {
  if (!id) {
    return 'tee'
  }

  const resolved = resolveTemplate({ id, version: Number(version) })

  if (resolved.ok) {
    return resolved.manifest.garmentId
  }

  return CURRENT_VERSIONS[id]?.garmentId ?? 'tee'
}

/** The template a garment prints on, if it has one. */
export function templateForGarment({ garmentId }: { garmentId: string }) {
  return Object.values(CURRENT_VERSIONS).find((manifest) => manifest.garmentId === garmentId)
}

/** How a render panel lies on the cloth for a design's pinned template. */
export function panelSurface({
  template,
  panel,
}: {
  template: { id: string; version: number }
  panel: PanelId
}) {
  const resolved = resolveTemplate(template)

  return resolved.ok
    ? Object.values(resolved.manifest.regions).find((region) => region.renderPanel === panel)?.surface
    : undefined
}

export type TemplateResolution =
  | { ok: true; manifest: TemplateManifest }
  | { ok: false; reason: 'unknown-template' | 'unsupported-version'; message: string }

export function resolveTemplate({
  id,
  version,
}: {
  id: string
  version: number
}): TemplateResolution {
  const versions = TEMPLATE_ARCHIVE[id]

  if (!versions) {
    return {
      ok: false,
      reason: 'unknown-template',
      message: `Garment template "${id}" is not available`,
    }
  }

  const manifest = versions[version]

  if (!manifest) {
    return {
      ok: false,
      reason: 'unsupported-version',
      message: `This design was made on ${id} version ${version}, which this app cannot open`,
    }
  }

  return { ok: true, manifest }
}
