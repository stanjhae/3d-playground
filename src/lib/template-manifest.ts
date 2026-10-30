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

/** Front panel height at which the collar band starts sampling it. */
const COLLAR_START_Y = 0.861

export const TEE_CREW_SHORT_V1: TemplateManifest = Object.freeze({
  id: 'tee-crew-short',
  version: 1,
  orientation: 'wearer',
  geometry: {
    file: '/models/tee.glb',
    sha256: '50654ee6efe843f7efa2bff433e91ae53c1eb1778652acbe653d6ebe08ae8bac',
    generator: 'scripts/build-tee.mjs (createTeeMesh in src/lib/tee-geometry.ts)',
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
        `The collar band reuses this panel above y ≈ ${COLLAR_START_Y}; marks there also show on the collar.`,
      ],
    },
    back: {
      label: 'Back',
      renderPanel: 'back',
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
        'In the current geometry the back runs the same direction as the front, so text drawn left-to-right reads mirrored from behind. Correcting this is R02 #165 and needs a new template version.',
      ],
    },
    left: {
      label: "Wearer's left sleeve",
      renderPanel: 'right',
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
      mesh: 'body-sleeve-left',
      uv: { u0: 0, v0: 0, u1: 0.5, v1: TORSO_V0 },
      axes: { x: 'around the sleeve', y: 'along the sleeve' },
      landmarks: { sleeveCentre: { x: 0.5, y: 0.5 } },
      notes: ["Built at −x by `buildSleeve({ side: 'left' })`: the wearer's right."],
    },
  },
}) as TemplateManifest

/** Every version that saved designs may reference. Never remove entries. */
const TEMPLATE_ARCHIVE: Record<string, Record<number, TemplateManifest>> = {
  'tee-crew-short': { 1: TEE_CREW_SHORT_V1 },
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
