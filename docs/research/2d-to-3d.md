# Research: from decorating a garment to designing its shape (2D → 3D)

**Status:** research note, 12 Nov 2026. Written for the founder's MVP review, which asked whether users could change a garment's shape, cut and proportions in 2D and have the 3D garment follow. That is the founder's "Workflow 1". Nothing here is a product claim, and `docs/claims-audit.md` still applies, including "no live AI anywhere".

## Status, 16 Nov 2026: Tiers 2 and 3 are built

(Updated 18 Nov: every phase below is merged. What's left, the costs and the build-or-buy question are in **Effort and cost** at the end.)

The owner chose to build Tiers 2 and 3 in full: in-browser simulation, all garments, Pattern mode as an opt-in beta, and the AI assist behind flags. The decision and its design rules are in `docs/decisions.md` (16 Nov). The phases are:

| Phase | What | State |
| --- | --- | --- |
| 0a | The `pattern` block reader (`docs/canonical-document.md`) | Built (#378) |
| 1–2 | Pattern geometry, and the XPBD cloth solver in a Web Worker | Built (#379) |
| 0b | Pattern templates for all nine garments | Built (#380) |
| 3 | Rendering a draped pattern in the studio, with prints through each piece's frame | Built (#381) |
| 4 | Stored draped meshes and the publish gate (a database migration) | Built (#382) |
| 5 | The Pattern (beta) editor, behind `VITE_PATTERN_BETA` | Built (#383) |
| 6 | The AI suggestion, behind `VITE_AI_ASSIST` and `FLP_AI_ASSIST` | Built (#384) |

Both flags are off until the owner turns them on (`docs/deploy.md`). On 18 Nov the owner turned `VITE_PATTERN_BETA` on (`true`) in Vercel Production, so Pattern (beta) is on for everyone on beta; migration `20261120090000_flp_pattern_meshes` was already on the database. `VITE_AI_ASSIST` is not set, and there is no Anthropic key.

**Spike S1 (tee drape), measured.** A four-piece tee: front, back, a sleeve and its mirror, ten seams.
- At 25 mm spacing it has about 1,560 particles and 2,850 triangles. It settles in about 3 s of simulated time, which took 0.4–0.6 s in node on a desktop.
- The seams weld shut, no particle ends inside the body, and the same pattern drapes bit-for-bit the same twice.
- Stretch compliance below 1e-7 goes unstable with one constraint pass per substep, so fabrics sit between 5e-7 (firm) and 2e-6 (jersey).
- Two things were needed for edits at their limits:
  - The seams close under almost no gravity before the weight comes in. Without that, a long, flared garment slid off the shoulders.
  - The mannequin's hands are colliders, so a sleeve longer than the arm gathers at the wrist.
- Damping climbs once the drape has formed, and the cloth counts as settled when no more than 0.5% of particles still move. That handles contact jitter, for example a long hem between the legs.

Still to measure: drape time on a real phone (the target is under 6 s for a tee). Desktop node figures for all nine garments are 0.4–1.0 s (#380).

**Spike S2 (tailored garments), result.** Coats, suits and the tailored coat drape and settle. Their fronts are one deep-V piece instead of overlapping lapels, because overlapping fronts would need cloth-to-cloth collision. Two-piece outfits (a shirt over a skirt, a jacket over trousers) keep their outer layer 8 mm clear of the inner one instead.

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

## Effort and cost (added 18 Nov 2026)

The founder asked (call agenda, round 3) for development effort, costs, and whether to build, integrate or license. All figures are estimates for this team, a single developer working with AI coding help. They aren't quotes.

### What it took, and what's left

| | Built so far | Left before it's a dependable feature for testers |
| --- | --- | --- |
| Tier 1: shape sliders | Done on the tee (Phase 6) | Same sliders on the newer garments: about 1–2 weeks |
| Tier 2: Pattern (beta) | Pattern document, cloth solver, 2D editor, cut-outs, fabric-driven drape, stored meshes (#378–#383, #394, #395) | Real-phone drape timing (target under 6 s for a tee), a tester round, and fixes from it: about 3–6 weeks |
| Tier 3: AI suggestion | Built behind two flags, with no key set (#384) | An API key, a cost cap per account and overall, moderation of inputs, and a claims-audit entry: about 1–2 weeks once Tier 2 is open to testers |

### Running costs

- **Tiers 1 and 2:** no per-use cost. The cloth simulation runs in the user's browser, and the drape is stored once per published version, in the database and storage we already pay for.
- **Tier 3:** each AI suggestion is one request to Claude Opus 5.5 (`claude-opus-5-5`, $4 per million input tokens, $20 per million output, at low effort). One sketch image plus the prompt is about 3,500 tokens in and 1,000–2,000 out, so about **3–5 cents per suggestion**.
  - The default cap of 30 suggestions per account per day (`FLP_AI_DAILY_LIMIT`) bounds the worst case at about **$1.50 per account per day**. A real tester would use a few.
  - A cheaper model could cut this. Claude Sonnet 5.5 costs about half as much, and Claude Haiku 5.5 a small fraction of a cent. But a smaller model would need checking on the same sketches first, since suggestions must stay valid patterns.
  - Before turning it on, set an overall monthly spending limit in the Anthropic console.

### Build, integrate or license

- **Professional garment tools (CLO3D, Browzwear VStitcher, Marvelous Designer):** desktop applications for fashion professionals, licensed per seat. They do pattern-to-3D simulation very well, but they aren't made to run inside a consumer website for every visitor. Using one here would need a commercial agreement with the vendor; ask them whether an embeddable or server licence exists and at what price. They are a good reference for what "good drape" looks like, and a possible export target later (designers could take a pattern into them).
- **AI image-to-3D services (TRELLIS, Hunyuan3D and similar):** they produce a convincing-looking surface, but no pattern pieces or printable areas, so they can't be edited, printed on or made. They don't fit as the core.
- **Building on our own pattern core (current approach):** the result is editable, printable and stays in our own document format and pipeline. The cost is the remaining work above, and the risk is drape quality and speed on low-end phones.

**Recommendation:** keep building on our own pattern core, use AI only as an assistant that produces Tier 1 settings or Tier 2 patterns, and revisit licensing only if testers say the drape quality isn't good enough.

## Recommended path (updated 18 Nov 2026)

1. **Now:** validate the current editor (Workflow 2 plus the Tier 1 shape sliders) with outside testers and the mockup-video campaign. Measure which shape controls they use.
2. **Next (Pattern (beta) is on since 18 Nov):** watch how testers use it, measure drape time on real phones, and fix what they find. Go or no-go on making it a standard mode depends on that round.
3. **Then:** turn on the AI suggestion for the same group, with spending caps, once Pattern (beta) holds up. Add the claims-audit entry first, and keep AI out of site claims until it really works.

Each tier stays optional in the UI. A beginner stays in Workflow 2, and an ambitious designer opts into shape, then pattern. That's how creative freedom grows without making the MVP harder to use.
