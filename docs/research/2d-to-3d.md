# Research: from decorating a garment to designing its shape (2D → 3D)

**Status:** research note, 12 Nov 2026. Written for the first external MVP test, which asked whether users could change a garment's shape, cut and proportions in 2D and have the 3D garment follow. That is the tester's "Workflow 1". Nothing here is a product claim, and `docs/claims-audit.md` still applies, including "no live AI anywhere".

## Where we are

The alpha follows **Workflow 2**: one fixed 3D garment per template, decorated by a 2D print document.

- The canonical document is the source of truth, and it describes **a print layout on a fixed template**. It has no physical units, sizes or fit (`docs/canonical-document.md`).
- Each template is a mesh (tee v4: `public/models/tee-real.glb`) whose pieces (front, back, sleeves) map to rectangles in a texture atlas. They are defined in `templates/*.pieces.json` and generated into `src/lib/templates/*.ts` by `scripts/build-template.mjs`.
- Layers live in panel-normalised coordinates, so they don't depend on the mesh's exact geometry, only on its UV layout.
- Template versions are pinned per design, and old versions are never removed (`docs/template-manifest.md`). Any change to a garment's shape has to respect that.

Workflow 1 asks for the garment's **geometry** to become user data too. The three tiers below are ordered by how far they move geometry into the document.

## Tier 1: parametric shape controls on existing templates

**What the user gets:** sliders on the real garment for left and right sleeve length (set separately, so asymmetry is allowed), body length or crop, body width (fitted to boxy) and neckline depth. Prints follow the shape.

**How:**
- Add a small `shape` block to the canonical document (neutral by default). A pure deformer moves the template mesh's vertices by region: sleeve, body, collar ring. It uses falloffs along each region's axis.
- Vertex and UV counts never change, so every print, stroke and graphic stays where it was on its piece.
- It renders through the same path everywhere: editor, thumbnails, share page.

**Effort:** weeks. A document field with a version bump and migration, one deformer module with unit tests, a slider rail, and the render paths. This is plan Phase 6.

**Architecture impact:** small.
- The document gains one block. The "fixed template" premise loosens to "template plus bounded parameters".
- Hashing, versioning and publishing all apply unchanged.
- The risk is visual: extreme values stretch prints. Ranges are clamped, and a later step could counter-scale prints on stretched regions.

**Limits:** it can only reach shapes the template's topology already has. It can't add a hood, split a hem, make a real asymmetric cut or draw a new silhouette.

## Tier 2: 2D sewing-pattern editing with cloth simulation

**What the user gets:** the garment itself is drawn as flat pattern pieces, the way garments are really made. Moving a piece's outline in 2D changes the cut: an asymmetric hem, a new neckline, a wider sleeve, a different silhouette. Drawing a new outline makes a new garment. The 3D garment is rebuilt by sewing the pieces together and simulating the fabric on a body.

**How:**
- **Pattern document.** Pieces become polygons or splines with seam pairs, which is a new section of the canonical document. Prior work shows patterns can be represented programmatically and parametrically. For example, the GarmentCode research (ETH Zürich, 2023) builds garments from composable, parametric sewing patterns.
- **Pieces are the UV layout.** A flat pattern piece *is* its own UV island, so the existing print document (panel-normalised layers) maps onto it naturally. This is the main reason our 2D-source-of-truth design is the right foundation.
- **Meshing and simulation.** Triangulate the pieces, place them around a body, then run a cloth simulation (stitch forces plus gravity and collision) until the garment drapes.

  The simulation can run in the browser (position-based or XPBD solvers on WebGPU/WebGL) or on a server, with the result cached as a mesh per pattern version. Server-side is easier to make reliable. In-browser gives live feedback.
- **Constraints.** Seam lengths must match, pieces can't self-intersect, and outlines need guardrails, so the user can't produce a pattern that can't be sewn.

**Effort:** months, with research risk. Five pieces of work:
- the pattern editor UI;
- the pattern document and its validator;
- meshing;
- a cloth solver, or integrating one, with stable, repeatable results;
- caching and versioning of simulated meshes.

Making it fast and deterministic enough for autosave, publishing and stored renders is the hardest part.

**Architecture impact:** large but compatible.
- Templates change from "a GLB" to "a pattern plus a simulation result".
- The pinned template version becomes a pinned *pattern version*.
- The render pipeline gains a simulation step, which must be deterministic for hashing and publication, or have its output stored.
- The current templates can become starting patterns. Tier 1's parameters become named controls that edit the pattern.

## Tier 3: AI sketch → 3D

**What it could offer:** a user sketches a garment, or describes it, and gets a 3D result.

**State of the art, honestly:**
- **Image-to-3D models** turn a picture into a convincing-looking 3D mesh. Several open and commercial models appeared in 2024–2025, for example Microsoft's TRELLIS and Tencent's Hunyuan3D. Their output is a single surface. It has no pattern pieces, seams or clean UV islands, and nothing tells it it's cloth. It can be looked at, but not edited as a garment, printed on reliably or manufactured.
- **Text/image-to-sewing-pattern research** is emerging. For example, DressCode (2024) generates sewing patterns from text. This is the useful direction, because the output is a Tier 2 pattern, which is editable and real. These systems are research-grade, limited to garment types they were trained on, and not yet a product dependency.

**Recommended role:** an *assistant on top of Tiers 1 and 2*, never the core.
- **Sketch → Tier 1 parameters** ("this looks like a cropped tee with one long sleeve"). Cheap, and it can't produce a broken garment.
- **Sketch or prompt → a starting Tier 2 pattern** that the user refines.

**Effort:**
- The assist for Tier 1 is weeks once Tier 1 exists.
- The pattern assist depends on Tier 2 and on the research maturing.
- Either way it adds ongoing per-use cost, latency, model and content-rights questions, and moderation.

**Architecture impact:**
- It needs a server-side inference path, which doesn't exist today.
- Its output must always go through the same document validators as hand-made input.
- `docs/claims-audit.md` would need a new entry before any AI claim appears on the site.

## Comparison

| | Tier 1: parametric | Tier 2: pattern + simulation | Tier 3: AI assist |
| --- | --- | --- | --- |
| Creative reach | Proportions within a template | Any sewable cut or silhouette | Speed: a starting point from a sketch |
| Effort | Weeks | Months, research risk | Weeks (on Tier 1) to open-ended (on Tier 2) |
| Architecture | One document block and a deformer | New pattern document, simulation step, pinned pattern versions | New inference service and validators |
| Editable result | Yes | Yes | Only if it outputs Tier 1/2 data |
| Prints follow | Yes (same UVs) | Yes (pieces are UV islands) | Inherited from the tier it targets |
| Depends on | Nothing new | Tier 1 is helpful, not required | Tier 1 or Tier 2 |

## Recommended path

1. **Now:** finish making Workflow 2 smooth (plan Phases 1–5), then ship **Tier 1** on the tee (Phase 6). Measure whether testers use the shape controls, and which ones.
2. **Next:** a time-boxed **Tier 2 spike**. Pick one tee pattern (front, back, two sleeves), build the pattern document and validator, and drape it with an off-the-shelf or server-side solver. Answer three questions:
   - Can we make it deterministic enough to hash and publish?
   - How fast is it in a browser?
   - Do panel-normalised prints map cleanly onto pattern pieces?

   Go or no-go on full Tier 2 from that.
3. **Later:** add **Tier 3** as an assistant that outputs Tier 1 parameters first, and Tier 2 patterns once Tier 2 exists. Keep it out of the critical path and out of site claims until it really works.

Each tier is optional in the UI. A beginner stays in Workflow 2, and an ambitious designer opts into shape, then pattern. That's how creative freedom grows without making the MVP harder to use.
