import type { CanonicalPanelId, TemplateId } from './canonical-document.ts'

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
}

export type TemplateManifest = {
  id: TemplateId
  version: number
  orientation: 'wearer'
  geometry: {
    file: string
    sha256: string
    generator: string
    /**
     * Body UV layout `createClothingMesh` builds for this version. The
     * scene always builds the newest layout; older versions are projected
     * onto it through `renderMirrorX`.
     */
    uvLayout: 1 | 2
    structural: { neck: 'crew'; hem: 'long'; sleeve: 'short' }
  }
  atlas: { width: number; height: number }
  material: { color: string; roughness: number; metalness: number }
  fonts: ReadonlyArray<{
    face: 'display' | 'sans'
    family: string
    package: string
    license: 'OFL-1.1'
  }>
  regions: Record<CanonicalPanelId, TemplateRegion>
}

const TORSO_V0 = 0.28

/** Front panel height above which the collar band's UVs overlap it. */
const COLLAR_START_Y = 0.861

export const TEE_CREW_SHORT_V1: TemplateManifest = Object.freeze({
  id: 'tee-crew-short',
  version: 1,
  orientation: 'wearer',
  geometry: {
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

/** The template new designs pin. */
export const CURRENT_TEMPLATE = TEE_CREW_SHORT_V2

/** Every version that saved designs may reference. Never remove entries. */
const TEMPLATE_ARCHIVE: Record<string, Record<number, TemplateManifest>> = {
  'tee-crew-short': { 1: TEE_CREW_SHORT_V1, 2: TEE_CREW_SHORT_V2 },
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
