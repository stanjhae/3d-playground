# Claims audit: landing, legacy concepts and pitch claims (V04 #199)

This is the engineering half of #199. It maps each of the 11 founder mockups, and every claim a visitor can see on the site, to one of four states:

- **Working:** the alpha does this, and there is a file, route or test to show it.
- **Concept:** shown only with a nearby "Concept preview" label (`ConceptPreviewBadge`).
- **Hidden:** shown only with `VITE_FLP_CONCEPT=true` (`CONCEPT_FEATURES`, `src/lib/concept-flags.ts`), which is off wherever the alpha runs, so no visitor sees it.
- **Removed:** a claim with no evidence, deleted.

The product owner gives final acceptance. #138 (asset rights) and #198 (product decisions and brand) still block #199, so this document doesn't close it. The questions still open are at the end.

**Audited:** `master` at `06e6c4c`, 11 Nov 2026, with `VITE_FLP_CONCEPT` off and sign-in required, as on beta. The first audit (1 Nov, `4631c16`) is in the history of this file. The copy fixes listed under "Changed on 11 Nov" are in the same PR as this document.

## How the site is gated

- **The landing** (`src/routes/index.tsx`) is public. Since 4 Nov it depends on `VITE_FLP_CONCEPT`. With the flag off, these don't render: the Community nav link and `#community` section, the Vote stage chip and its sample ranking, the Coming soon section (model shoot, video), the Gradient pattern, non-tee silhouettes, and the Share stage's sample stills. What remains of the concepts carries a visible badge.
- **The studio** (`/create`, `/studio`) and pages behind sign-in need an account wherever Supabase is configured, and the terms are accepted once before them (`TermsGate`). The flag also hides non-tee garments and sample sizes in the studio (`SilhouetteSwitch.tsx`). The studio contains no marketing copy: no counts, offers or waitlist.
- **Guest-era pages:** `/vote` and `/look/*` show "Not part of this alpha" when sign-in is required (`NotInAlpha.tsx`). The server refuses new guest looks, and guest votes answer 410 (V1). Voting is one vote per account, on a shared design's page.
- **Pinned by tests:**
  - `e2e/claims.spec.ts` reads every landing stage, sign-in, `/vote`, each studio step, the shared page and `/privacy`, including visible field values. It fails on measurements, sizes, fabric weights, production readiness, traction counts, early or free access, the old name, "oversized", "voting comes later" and sample creators, and on any image from `/stills/`.
  - `src/lib/brand-name.test.ts` keeps the old name out of the code, the auth config and the sign-in email, and pins the email's code expiry.

## The 11 mockups

The mockups are `IMG-20260915-WA00xx.jpg`, supplied by the founder (S10 in #125). The "PRD treatment" column quotes #125 §17. A mockup establishes a design idea, not an implementation commitment.

| Mockup | Signal | PRD treatment | State | Evidence |
| --- | --- | --- | --- | --- |
| WA0000 | Draw, suggestions, live garment preview | One canonical editor. Drawing and 3D work. Curated graphics are labelled Graphics, not AI. | **Working** | Studio draw → 3D: `e2e/journey.spec.ts`, `e2e/render-idle.spec.ts`. The landing hero pad and graphics write to one document (`LandingHero.tsx`). Both the landing and the studio call the panel **Graphics** (`FLV_COPY.suggestionsTitle`, `GraphicLibrary.tsx`). Both still carry a concept badge though they work; see R1. |
| WA0001 | Garment selection and details | One cleared T-shirt. Extra categories deferred. No fabric-weight or size claims. | **Working** (tee); others **hidden** | The tee is the only canonical garment (`isCanonicalGarment`). The landing's Select stage lists only categories with a studio garment, so Tops → Tee (`landing-demo.ts`, `showsGarmentInStudio`). Sample sizes are hidden. Garment asset rights: #138. |
| WA0003 | Base color, patterns, material finish | Solid, stripes, check with controlled colors. One credible material preset. | **Working** (color, solid/stripes/check); finish and texture **concept**; gradient **hidden** | `BASE_KINDS = ['solid','stripes','check']` (`canonical-document.ts`); `e2e/visual-matrix.spec.ts`. The landing's Finish, Texture and Material details carry badges. |
| WA0008 | Four-sided drawing | Front, back, both sleeves. Brush, eraser, undo. One canvas with a persistent preview. | **Working** | Four panels (`garments.ts`); `e2e/journey.spec.ts`, `panel-uv.test.ts`, `editor-history.test.ts`; `docs/demo.md` step 4. The landing pad paints the front only; the four-sided claim refers to the studio. |
| WA0010 | Precise placement, graphic library | Text, graphics, layers and numeric transforms. Embroidery, seam wrapping, stitching and manufacturer units deferred. | **Working** | Numeric position and size: `e2e/transform-fields.spec.ts`. Layers, restacking, locks, flips and snapping: `layer-list.test.ts`, `reorder-colour.test.ts`, `locks-writer.test.ts`, `flip-writer.test.ts`, `panel-snap.test.ts`. No embroidery, stitching or centimetre placement appears anywhere. |
| WA0012 | Draw, then refine, then inspect | Tools and views of one document. No garment-shape reconstruction or AI sketch conversion. | **Working** | Tools are views over one canonical document (`docs/canonical-document.md`). Nothing claims vector conversion or reconstruction. |
| WA0015 | Avatar measurements, realistic fit | Future fit exploration. No measurement-driven accuracy or simulation claim. | **Concept** | The landing's Preview stage says "3D try-on preview" with a badge and "Visual fit simulation — not production sizing." No measurements are shown. Try-on in the studio is opt-in, and published pictures never show the figure. Public pages say "Creator-supplied preview, not a certified fit or manufacturing render" (`PUBLIC_PREVIEW_DISCLAIMER`). |
| WA0017 | AI model-shoot presets and results | A conditional downstream still-image experiment. | **Hidden** | The Coming soon section doesn't render with the flag off. With it on, it says "Live generation is not built yet" (`LandingSoon.tsx`). No AI service exists. Rights to `public/stills/*`: #138. |
| WA0019 | Runway/video studio | Future pipeline. Any sample clip is illustrative. | **Hidden** | As WA0017. With the flag on: "Motion generation is not built yet". No video exists. |
| WA0022 | Personal work, draft save, publishing, visibility | Account workspace, private by default, a public link to a chosen version. No community feed or remix rights. | **Working** | `e2e/journey.spec.ts` (create → save → publish → view signed out → unpublish → delete), `e2e/isolation.spec.ts`, My Studio (`e2e/my-studio.spec.ts`). The landing's Share stage is a badged sample: its visibility choice is **Private / Published by link**, matching the real model, and its button reads "Publish from My Studio". |
| WA0028 | Discovery and rankings | A separate concept phase. No live rankings and no traction inferred. | **Working** (votes); rankings **hidden** | Real voting: one vote per account on a shared design (`VoteButton.tsx`, `publication_votes` primary key, `votes.integration.test.ts`). The count is read from the database, never claimed. No ranking is built from account votes. The landing's sample "Top designs" is hidden; with the flag on it says "Sample ranking from the legacy guest board. Not live traction." |

## Every visible claim

Listed top to bottom, as a visitor sees them with the flag off. Copy lives in `src/lib/flv-copy.ts` unless another file is named.

### Header and footer (`src/routes/__root.tsx`, `src/components/site/SiteFooter.tsx`)

| Claim | State | Evidence |
| --- | --- | --- |
| Brand "FLV / Fashion Leader Vote" | Working | One name across pages, `index.html`, share cards, terms, privacy and the sign-in email (Q1). |
| Landing nav: Product, How it works, Waitlist | Working | Anchors on the same page. |
| "Sign in", or "My Studio" when signed in; "Join the waitlist" | Working | |
| Other pages: Home, Create, account control | Working | |
| Footer: "Fashion Leader Vote is an early alpha.", Privacy, Terms, Contact | Working | Contact is the alpha address (`VITE_FLP_CONTACT_EMAIL`). The footer is hidden in the studio and on shared pages. |

### Hero (`src/components/landing/LandingHero.tsx`)

| Claim | State | Evidence |
| --- | --- | --- |
| "Design fashion. See it instantly. Lead the future." | Working (slogan) | The hero 3D updates as you draw on the pad. "Lead the future" makes no measurable claim. |
| "Draw freely, refine digitally and see every change instantly on a realistic 3D garment." | Working | Live 3D from the pad. "Realistic" is the owner's judgement (R16, #125). |
| "Start creating →" | Working | Opens `/create?step=design` with the landing design handed over (`e2e/landing-import.spec.ts`). Needs sign-in. |
| "Layer 1 Draw", "⚡ Live", "Real-time sync — design updates instantly.", "⚡ Live 3D Update" | Working | The pad writes strokes to the document the hero renders. |
| "Graphics" panel, "Apply to design" | Working, with a concept badge | Curated SVGs (`graphics-library.ts`), not AI; see R1. |
| "Layer 3 3D Preview" with view buttons | Working | |
| "01 Three ways to create: Draw, add graphics and words, see it in 3D" | Working | In the studio. The landing itself has no words tool. |
| "02 Four-sided design: Front, back and both sleeves" | Working | WA0008. |
| "03 Save and share: Private by default. Share a saved version by link." | Working | WA0022. |

### Flow overview and stage rail (`LandingFlowOverview.tsx`, `LandingStageRail.tsx`, `src/lib/landing-stages.ts`)

| Claim | State | Evidence |
| --- | --- | --- |
| "Three steps. One seamless flow. Same garment. Live at every step." | Working | The stages drive one shared hero stage. |
| Garment: "Choose a silhouette and cut. Bring ideas to life." | Working (tee) | Neck, hem and sleeve options on the tee. |
| Design: "Draw freely. Tech refine. See every side live." | Working | WA0008, WA0012. |
| Preview & share: "Preview every side. Share a saved version by link." | Working | WA0022. |

### Stage demos (`src/components/landing/LandingStageHost.tsx`)

Visible chips: Select, Fit, Color, Design, Preview, Share. "Live 3D updates in the hero stage above."

| Stage | Claim | State | Evidence |
| --- | --- | --- | --- |
| Select | Tops → Tee; "House silhouette with realistic 3D model"; "Open in studio to design" | Working | Only the tee is listed with the flag off. |
| Fit | Crew, V, Crop, Long hem, Short and Long sleeve; "Neck, hem, and sleeve change the cloth — not the body." | Working | `garments.ts`, `tee-geometry.test.ts`. |
| Color | Base colors; Solid, Stripes, Check | Working | WA0003. |
| Color | Finish (Matte, Silk, Wool, Denim, Leather), Texture (Standard … Crinkle), Material details | Concept | Each has a badge. Material details shows the chosen ids as a plain line ("solid · standard · matte"); see R5. |
| Design | Brush, Eraser, Fill, size, opacity, graphics with position and size, 3D preview | Working | One document across all three panels. |
| Preview | "Preview every side", "3D try-on preview", avatars, Studio/Outdoor | Concept | Badge, plus "Visual fit simulation — not production sizing." The avatar scales visually; no measurements are shown. |
| Share | "Share a saved version": "Private by default. Publish a saved version when you choose, and share it by link." | Working | WA0022. |
| Share | Sample title, tags, method and visibility | Concept | Badge, plus "Sample fields. In the alpha a design stays private until you publish a saved version by link." The button opens My Studio. |

### Waitlist (`src/components/landing/LandingWaitlist.tsx`, `api/waitlist.ts`)

| Claim | State | Evidence |
| --- | --- | --- |
| "👑 Waitlist", "Join the waitlist" | Working | Posts to `/api/waitlist` (`waitlist-store.test.ts`). |
| "Leave your email to hear when there's news. There's no invite or date yet." | Working | Promises nothing more; owner to accept (R2). |
| "Only your email required." | Working | |
| "Fashion Technology People Impact" | Working (decorative) | Makes no claim. |

### Sign-in and its email (`src/routes/sign-in.tsx`, `supabase/templates/email-code.html`, `supabase/config.toml`)

| Claim | State | Evidence |
| --- | --- | --- |
| "We email you a one-time code. No password needed; new accounts are created on first sign-in." | Working | Email-only auth (hosted check `auth-providers`). |
| "a 6-digit code … works once and expires in 10 minutes" | Working | `otp_length = 6`, `otp_expiry = 600`; `brand-name.test.ts`. |
| Email subject and body: "Your Fashion Leader Vote sign-in code" | Working | `brand-name.test.ts`. |

### Shared design page (`src/routes/s.$slug.tsx`)

| Claim | State | Evidence |
| --- | --- | --- |
| "By {name} · version N · published {date}" | Working | The published version only (`e2e/journey.spec.ts`). |
| Vote button and count; "Sign in to vote" signed out | Working | One per account, retractable, and votes carry over a republish (`votes.integration.test.ts`, `e2e/claims.spec.ts`). |
| "Creator-supplied preview, not a certified fit or manufacturing render." "Shown on a fixed T-shirt template." | Working | `PUBLIC_PREVIEW_DISCLAIMER`. |
| "Report this design", Privacy, "Make your own", Copy link | Working | Report opens the alpha address (`docs/requests.md`). |

### Other pages

| Page | Claim | State | Evidence |
| --- | --- | --- | --- |
| `/vote`, `/look/*` | "Not part of this alpha … To vote, open a shared design's link and sign in." | Working | Corrected on 11 Nov (it said "Voting comes later."). Pinned in `claims.spec.ts`. |
| `/privacy` | What is stored, who sees it, removal, reporting | Working | Checked against the code for #195. |
| `/terms`, terms gate | Terms of use, version `TERMS_VERSION` | Working | The wording is a plain-language draft awaiting the owner's review (#347). |
| `/soon` | Redirects to `/#waitlist` | Working | |

## Categories #199 calls out

| Category | Status |
| --- | --- |
| Counts | None on the landing. The only number is a shared design's live vote count, read from the database. |
| Rankings | No ranking exists from account votes. The sample "Top designs" is hidden. |
| Offers ("10K", free access) | Removed on 1 Nov, and pinned out by `claims.spec.ts`. |
| AI | No live AI anywhere. Model shoot and video are hidden. Graphics are curated and called Graphics. |
| Vector conversion | Not claimed anywhere. |
| Avatar fit | Concept-labelled, "not production sizing". No measurements shown. |
| Production/manufacturing | Not claimed. Public pages say the opposite. |
| Commerce | None: no price, shop, checkout or payment copy. |

## Founder QA trackers

These older founder-QA trackers predate the PRD v1.1 baseline. They are linked for history and are **not** marked complete by this audit:

- #92 "[L8] Founder QA — would you hand someone a pencil?" (open)
- #106 "[L9] Founder QA — would you hand an investor this URL?" (open)

Each asks for an honest Pass or Fail from the founder on the live URL. This document provides neither.

## History

- **1 Nov:** first audit. Removed "10K+ Designers on the waitlist", the "6 months free access" offer and its terms, "Premium finish" and "Studio-ready". Added concept badges.
- **4 Nov:** safe defaults, owner to accept. One brand, Graphics in the studio, Gradient and non-tee shapes and sample sizes hidden, nav says Waitlist, waitlist offers news only, sample stills, board and creators hidden, cm sliders gone. Each was its own commit.
- **6 Nov:** UI overhaul. No new claims. The tee is no longer called oversized or drop-shouldered.
- **11 Nov:** this refresh. See below.

## Changed on 11 Nov 2026

- `/vote` and `/look/*` said "Voting comes later." Account voting shipped in V1, so it now says where voting is.
- The Share stage sample called the tee "Oversized" in its title and tags, which the tee isn't. Its visibility offered Public / Private / Unlisted, which aren't the real model. It's now Private / Published by link.
- `claims.spec.ts` also reads visible field values, where the sample title sat unchecked. It now forbids "oversized" and "voting comes later", and checks `/vote`.
- `brand-name.test.ts` also pins the code's expiry in the email ("expires in 10 minutes") to the auth config.

## Settled questions

The eight questions from the first audit, as the code now stands:

1. **Brand:** Fashion Leader Vote everywhere, including the email. Owner decision (#198).
2. **"Try on & share" and "Publish to community":** gone. The rail says "Preview & share", and the stage says "Share a saved version".
3. **"Suggestions" in the studio:** now Graphics.
4. **Gradient:** hidden.
5. **Non-tee silhouettes:** hidden on the landing as in the studio.
6. **Nav "About":** now "Waitlist".
7. **Waitlist promise:** "There's no invite or date yet." Owner to accept: R2.
8. **Stills and graphics rights:** stills are hidden and pinned out. Graphics are still shown: R3.

## Still open for the owner

- **R1. Badges on working graphics.** The hero's Graphics panel and the studio's Graphics panel carry a Concept preview badge, but both work. Keep the badges until the graphics rights are cleared (R3), then remove them?
- **R2. Waitlist wording.** Accept "Leave your email to hear when there's news. There's no invite or date yet.", or give new wording.
- **R3. Rights to `public/graphics/*`** (#138). They are shown on the landing and in the studio.
- **R4. "Realistic 3D garment"** in the hero lead. Is the white-studio tee good enough to say "realistic" at the pitch (R16)?
- **R5. Material details.** Shows the chosen ids as a plain line ("solid · standard · matte") under a concept badge. Show proper names, or drop the line?
- **R6. Terms wording** (#347): plain-language draft awaiting review.
