# Claims audit: landing, legacy concepts and pitch claims (V04 #199)

This is the engineering half of #199. It maps each of the 11 founder mockups, and every claim a visitor can see on the landing page (`/`), to one of three states:

- **Working:** the alpha does this, and there is a file, route or test to show it.
- **Concept:** shown only with a nearby "Concept Preview" label (`ConceptPreviewBadge`), or hidden in the studio unless `VITE_FLP_CONCEPT=true` (`src/lib/concept-flags.ts`).
- **Removed:** a claim with no evidence, now deleted from the landing.

The product owner gives final acceptance. #138 (asset rights) and #198 (product decisions and brand) still block #199, so this document doesn't close it. The open questions at the end are for the owner to decide.

**Audited:** `master` at `4631c16`, 1 Nov 2026. The landing copy fixes described below are in the same PR as this document.

## How the landing is gated

- The landing (`src/routes/index.tsx`) is public, and nothing on it depends on `VITE_FLP_CONCEPT`. Concept sections carry a visible `ConceptPreviewBadge` instead. A visitor sees the same page whatever the flag is set to.
- In the studio, `VITE_FLP_CONCEPT` (default `false`, `.env.example`, `docs/deploy.md`) hides the non-tee garments in the silhouette switch (`src/components/editor/SilhouetteSwitch.tsx` via `showsGarmentInStudio`). Other studio concept surfaces are visible but labelled: graphics "Suggestions", sample size, avatar fit note, publish attachments.
- Sign-in is required for `/create` and `/studio` wherever Supabase is configured. `/vote` shows "not in the alpha" under the same rule (`src/routes/vote.tsx`, `AUTH_REQUIRED`). The server refuses new guest-board looks and votes (`guestBoardClosed`, `src/lib/designs-handlers.ts`). Reads of existing guest looks stay open.
- The studio contains no marketing copy (no counts, offers or waitlist). This audit added none.

## The 11 mockups

The mockups are `IMG-20260915-WA00xx.jpg`, supplied by the founder (S10 in #125). The "PRD treatment" column quotes #125 §17. A mockup establishes a design idea, not an implementation commitment.

| Mockup | Signal | PRD treatment | State | Evidence |
| --- | --- | --- | --- | --- |
| WA0000 | Draw, suggestions, live garment preview | One canonical editor. Drawing and 3D work. Curated graphics are labelled Graphics, not AI. | **Working**, with the graphics label as a concept | Studio draw → 3D: `e2e/journey.spec.ts`, `e2e/render-idle.spec.ts`, `src/lib/edit-render-timing.test.ts`. Landing hero pad and graphics write to one `DesignDocument` (`src/components/landing/LandingHero.tsx`). The landing now says **Graphics**. The studio panel still says "Suggestions" with a concept badge (`src/components/editor/GraphicLibrary.tsx`); see Q3. |
| WA0001 | Garment selection and details | One cleared T-shirt. Extra categories deferred. No fabric-weight or size claims. | **Working** (tee); others are **concept** | Tee is the only canonical garment (`isCanonicalGarment`, `src/lib/concept-flags.ts`). The landing's Garment stage now labels every non-tee silhouette as a concept ("Concept silhouette. The alpha studio designs the tee only."). The studio hides non-tees unless the flag is on. The studio's "Size (sample)" is concept-labelled (`SilhouetteSwitch.tsx`). Garment asset rights: #138. |
| WA0003 | Base color, patterns, material finish | Solid, stripes, check with controlled colors. One credible material preset. | **Working** (color, solid/stripes/check); finishes, textures and gradient are **concept** | `BASE_KINDS = ['solid','stripes','check']` in `src/lib/canonical-document.ts`. Tests: `src/lib/canonical-document.test.ts`, `src/lib/render-parity.test.ts`, `e2e/visual-matrix.spec.ts`. The landing's Finish (Matte/Silk/Wool/Denim/Leather), Texture and Material details now carry concept badges; see Q4 for Gradient. |
| WA0008 | Four-sided drawing | Front, back, both sleeves. Brush, eraser, undo. One canvas with a persistent preview. | **Working** | Four panels (`src/lib/garments.ts`: front, back, wearer's right, wearer's left). `e2e/journey.spec.ts`, `src/lib/panel-uv.test.ts`, `src/lib/panel-orientation.test.ts`, `src/lib/editor-history.test.ts`, `docs/demo.md` step 4. The landing's own draw pads only paint the front panel; the four-sided claim refers to the studio. |
| WA0010 | Precise placement, graphic library | Text, graphics, layers and numeric transforms. Embroidery, seam wrapping, stitching and manufacturer units deferred. | **Working** | Numeric X/Y/size/turn: `e2e/transform-fields.spec.ts`, `src/lib/transform-fields.test.ts` (#262). Layers: `src/lib/layer-list.test.ts`. Graphics: `src/lib/graphics-library.test.ts`. No embroidery, stitching or centimetre placement appears anywhere. |
| WA0012 | Draw, then refine, then inspect | Tools and views of one document. No garment-shape reconstruction or AI sketch conversion. | **Working** | Draw and Tech are modes over the same canonical document (`designEditMode` in `src/routes/create.tsx`; `docs/canonical-document.md`, "Editor commands"). Switching mode converts nothing (`src/lib/editor-store-v2.test.ts`, `src/lib/canonical-commands.test.ts`). Nothing claims vector conversion or reconstruction. |
| WA0015 | Avatar measurements, realistic fit | Future fit exploration. No measurement-driven accuracy or simulation claim. | **Concept** | The landing's "Try it on" stage is now labelled "3D try-on preview" with a concept badge and "Visual fit simulation — not production sizing." The studio's `AvatarRail.tsx` shows the same note. Public pages say "Creator-supplied preview, not a certified fit or manufacturing render" (`PUBLIC_PREVIEW_DISCLAIMER`, `src/lib/og-card.ts`). |
| WA0017 | AI model-shoot presets and results | A conditional downstream still-image experiment. | **Concept** | Landing "Coming soon → Model shoot": "Soon" plus concept badge, and the copy says "Live generation is not built yet" and "Canned stills … not live generation" (`src/components/landing/LandingSoon.tsx`). The images are fixed files in `public/stills/` (`CANNED_STILLS`). No AI service exists. The publish bar's "Model Shoot" attachment is concept-labelled (`src/components/editor/PublishBar.tsx`). Rights to the stills: #138. |
| WA0019 | Runway/video studio | Future pipeline. Any sample clip is illustrative. | **Concept** | Landing "Coming soon → Fashion video": "Motion generation is not built yet", and the export says "Concept Preview — no …" (`LandingSoon.tsx`). It shows no video, only stills. |
| WA0022 | Personal work, draft save, publishing, visibility | Account workspace, private by default, a public link to a chosen version. No community feed or remix rights. | **Working** | `e2e/journey.spec.ts` (create → save → publish → view signed out → unpublish → delete), `e2e/isolation.spec.ts`, `src/lib/design-visibility.test.ts`, `src/lib/version-history.test.ts`, `docs/demo.md`. The landing's Share stage mock now defaults to **Private**, carries a concept badge, says the stills and fields are samples, and its button reads "Publish in studio". |
| WA0028 | Discovery and rankings | A separate concept phase. No live rankings and no traction inferred. | **Concept** | The landing's "Top designs" now has a concept badge and "Sample ranking from the legacy guest board. Not live traction." The ranks are vote counts on legacy guest looks (`rankDesigns`, `src/lib/rank-designs.ts`). `/vote` is closed in the alpha. |

## Every visible claim on the landing

Listed top to bottom. "Before" is the copy on `master`. Copy lives in `src/lib/flv-copy.ts` unless another file is named.

### Header and hero (`src/routes/__root.tsx`, `src/components/landing/LandingHero.tsx`)

| Claim | State | Evidence or change |
| --- | --- | --- |
| Brand "FLV / Fashion Leader Vote" | Open question | The public brand isn't decided (#125 §2, #198); see Q1. |
| Nav: Product, How it works, Community, About, Login, Join the waitlist | Working | Anchors on the same page. "Community" scrolls to the concept-labelled sample ranking. "About" goes to the waitlist; see Q6. |
| "Design fashion. See it instantly. Lead the future." | Working (slogan) | "See it instantly": the hero 3D updates as you draw on the pad. "Lead the future" is aspirational and makes no measurable claim. |
| "Draw freely, refine digitally and see every change instantly on a realistic 3D garment." | Working | Draw and Tech modes, live 3D: WA0000/WA0012 rows. The visual quality bar is R16 (#125); the owner judges "realistic". |
| "Start creating →" | Working | Links to `/create`, which requires sign-in. The handoff carries the landing design: `e2e/landing-import.spec.ts`. |
| **"10K+ Designers on the waitlist"** | **Removed** | No evidence. `waitlist-store` holds whatever emails arrive, and no count supports 10K. |
| "Concept Preview" badge beside the hero | Concept | Labels the hero demo. |
| "Layer 1 Draw", "⚡ Live", "Real-time sync — design updates instantly." | Working | The landing pad writes strokes to the document the hero stage renders. Studio timing: `src/lib/edit-render-timing.test.ts` (#265). |
| "⚡ Live 3D Update" | Working | As above. |
| "Suggestions" panel with graphics and "Apply to design" | Concept, relabelled | Now titled **Graphics** (`graphicsTitle`), as #125 §17 requires. It already had a concept badge. These are curated SVGs (`src/lib/graphics-library.ts`), not AI suggestions. |
| "Layer 3 3D Preview" with view buttons | Working | Camera views on the hero stage. |
| "01 Three Creative Workflows: Draw / Suggestions / 3D Preview" | Working, relabelled | Now "Draw / Graphics / 3D Preview". |
| "02 Four-Sided Design: Front / Back / Left / Right" | Working | WA0008 row. |
| **"03 Try On. Create Content. Share. Your designs. Your community."** | **Removed**, replaced | Try-on and content creation are concepts (WA0015, WA0017), and no community feed exists. Replaced with "03 Save and Share: Private by default. Share a saved version by link." (WA0022 row). See Q2. |

### Flow overview and stage rail (`LandingFlowOverview.tsx`, `LandingStageRail.tsx`, `src/lib/landing-stages.ts`)

| Claim | State | Evidence or change |
| --- | --- | --- |
| "Three steps. One seamless flow. Same garment. Live at every step." | Working | The three landing stages drive one shared hero stage. |
| Garment: "Choose a silhouette and cut. Bring ideas to life." | Working (tee), concept (others) | Neck, hem and sleeve on the tee are in the studio (`src/lib/garments.ts` structural options). Non-tees: WA0001 row. |
| Design: "Draw freely. Tech refine. See every side live." | Working | WA0008, WA0012 rows. |
| **Try on & share: "Try it on. Capture media. Enter the board."** | **Removed**, replaced | "Capture media" (AI shoot) and "Enter the board" (rankings) are concepts. Now "Preview every side. Share a saved version by link." The rail label "Try on & share" stays, and the stage it opens is concept-labelled; see Q2. |

### Stage demos (`src/components/landing/LandingStageHost.tsx`)

| Stage | Claim | State | Evidence or change |
| --- | --- | --- | --- |
| Select | Categories Tops/Bottoms/Outerwear/Accessories, the silhouette grid | Working (tee), **concept** (others) | Non-tee silhouettes now show a concept badge and "Concept silhouette. The alpha studio designs the tee only." Credits such as "by Style3D CG" stay; their rights are #138. See Q5. |
| Select | "Realistic 3D model / Live preview on landing / Open in studio to design" | Working (tee) | For non-tees, the concept note above corrects "Open in studio to design". |
| Fit | Crew, V, Crop, Long hem, Short and Long sleeve | Working (tee) | Tee structural presets: `src/lib/garments.ts`, `src/lib/tee-geometry.test.ts`. |
| Fit | "Neck, hem, and sleeve change the cloth — not the body." | Working | As above. |
| Color | Base color swatches | Working | Studio base color; `e2e/visual-matrix.spec.ts`. |
| Color | Pattern: Solid, Stripes, Check | Working | WA0003 row. |
| Color | Pattern: Gradient | Open question | It isn't in `BASE_KINDS`; it exists only on the landing. See Q4. |
| Color | Finish: Matte, Silk, Wool, Denim, Leather | **Concept** | Badge added. Fabrics are concept features (`docs/decisions.md`). |
| Color | Texture: Standard, Washed, Ribbed, Mesh, Terry, Crinkle | **Concept** | Badge added. These only change landing roughness values (`TEXTURE_SURFACE`, `src/lib/landing-demo.ts`). |
| Color | Material details: **"Premium finish"**, "Live on cloth", **"Studio-ready"** | Concept; two items **removed** | Badge added. "Premium finish" (no evidence) and "Studio-ready" (false: the studio has no finish picker without the flag) are removed. "Live on cloth" stays, because it is true on the landing. |
| Design | Layer 1 Draw (Brush/Eraser/Fill, size, opacity), Layer 2 Tech design (graphics, X/Y/size), Layer 3 3D Preview | Working | One document across all three panels (`DesignDemo`). Studio parity: WA0010/WA0012 rows. |
| Preview | **"Live 3D fit preview"**, **"Avatar fit and camera angles before you share."**, avatars, height/chest/waist in cm, studio/outdoor | **Concept** | Now "3D try-on preview" and "Avatar and camera angles before you share.", with a concept badge and "Visual fit simulation — not production sizing." The avatar scales visually and makes no fit claim (WA0015 row). |
| Share | **"Publish to community"**, "Angle stills, tags, and method — then enter the vote.", sample stills, title/tags fields, visibility defaulting to **Public** | **Concept** | Badge and "Sample stills and fields. In the alpha a design stays private until you publish a saved version by link." added. The visibility mock now defaults to Private, as the PRD requires. The button reads "Publish in studio" and still opens `/create?step=share`. The stage title stays "Publish to community" (also used by `landing-stages.ts`); see Q2. |
| Vote | **"Top designs: The most inspiring looks from the house."** with numbered ranks | **Concept** | Badge and "Sample ranking from the legacy guest board. Not live traction." added. "See the board" opens `/vote`, which is closed in the alpha. |

### Coming soon (`src/components/landing/LandingSoon.tsx`)

| Claim | State | Evidence |
| --- | --- | --- |
| "Coming soon" heading, "Soon" + concept badge | Concept | Already labelled. |
| Model shoot: presets, configuration, "Preview model shoot", results | Concept | The copy already says live generation isn't built and the results are canned stills (WA0017 row). |
| Fashion video: scenes, settings, export presets, "Preview video" | Concept | The copy already says motion generation isn't built (WA0019 row). |

### Waitlist (`src/components/landing/LandingWaitlist.tsx`, `api/waitlist.ts`)

| Claim | State | Evidence or change |
| --- | --- | --- |
| "👑 Early access" | Working | The form posts to `/api/waitlist` (`src/lib/waitlist-store.test.ts`). |
| **"6 months free access"** (heading) and **"Join the waitlist today. Get 6 months of free access."** | **Removed** | No offer, plan or billing exists. Now "Join the waitlist" and "Leave your email to hear about early access." See Q7. |
| **"All software packages included"**, **"No payment required"**, **"No automatic subscription"**, **"Access expires automatically"** | **Removed** | These are terms of an offer that doesn't exist. There are no packages, payments or subscriptions in the code. |
| "Only your email required." | Working | The form asks only for an email. |
| "Fashion Technology People Impact" (vertical tag) | Working (decorative) | Makes no claim. |

## Categories #199 calls out

| Category | Status after this PR |
| --- | --- |
| Counts | "10K+" removed. No other counts remain on the landing. Board ranks are labelled samples. |
| Rankings | Concept-labelled on the landing. `/vote` is closed in the alpha. |
| Offers ("10K", free access) | Removed. |
| AI | No live AI anywhere. Model shoot and video are concept-labelled and say generation isn't built. Curated graphics are labelled "Graphics" on the landing. |
| Vector conversion | Not claimed anywhere (searched `src/`). Draw and Tech share one document with no conversion step. |
| Avatar fit | Concept-labelled, with "not production sizing" on the landing and in the studio. |
| Production/manufacturing | Not claimed. Public pages say "not a certified fit or manufacturing render". |
| Commerce | None. No price, shop, checkout or payment copy (searched `src/`). The waitlist's "no payment" line is removed with the offer. |

## Founder QA trackers

These older founder-QA trackers predate the PRD v1.1 baseline. They are linked for history and are **not** marked complete by this audit:

- #92 "[L8] Founder QA — would you hand someone a pencil?" (open)
- #106 "[L9] Founder QA — would you hand an investor this URL?" (open)

Each asks for an honest Pass or Fail from the founder on the live URL. This document provides neither.

## Open questions for the owner

1. **Brand.** The landing says "FLV / Fashion Leader Vote", and #125 uses "Fashion Leaderboard (FLP)". Which public name goes on the pitch build? (#198)
2. **Third value line and the "Try on & share" stage.** This PR replaced the hero's "Try On. Create Content. Share." with the working "Save and Share" line, and the flow card's lead with "Preview every side. Share a saved version by link." Should the rail label "Try on & share" and the stage title "Publish to community" also change, or stay as concept-labelled vision?
3. **"Suggestions" in the studio.** The landing now says "Graphics". The studio's graphics panel still says "Suggestions" with a concept badge. Rename it to "Graphics" as well? It's a one-word change in `FLV_COPY.suggestionsTitle`.
4. **Gradient pattern.** The landing offers Gradient, but the canonical document supports only solid, stripes and check. Remove it, or label it as a concept?
5. **Non-tee silhouettes on the landing.** They are labelled as concepts but still shown. Should the landing hide them unless `VITE_FLP_CONCEPT` is on, as the studio does?
6. **Nav "About"** jumps to the waitlist. Keep it, rename it, or drop it?
7. **What early access means.** Now that the free-access offer is gone, does the waitlist promise anything (an alpha invite, a date)? Any new wording needs the owner's approval.
8. **Curated stills and graphics.** The rights to `public/stills/*` and `public/graphics/*` are open in #138, and they decide whether these images can be shown at the pitch at all.
