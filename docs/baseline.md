# FLP baseline record (F01, #136)

Recorded 30 October 2026. This is the starting point for PRD v1.1. It records what the existing playground does, not PRD acceptance.

## Revisions

| What | Revision | Evidence |
| --- | --- | --- |
| Reviewed commit | `98ef4bb` (`origin/master`, merge of #124) | `git rev-parse origin/master` |
| Deployed production | `98ef4bb`, 25 Sep 2026 | GitHub deployments API (`environment: Production`); `vercel ls` shows Ready production |
| Live URL | https://3d-playground-vert.vercel.app/ | README |

The deployed and reviewed revisions match. This is parity of commit only, not a check of behaviour on the deployment.

## Reproduce from a clean checkout

```bash
git worktree add --detach ../baseline origin/master
cd ../baseline
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Environment used: Node 22.22.3, pnpm 12.15.0, macOS. `engines.node` is `^20.19.0 || >=22.12.0`.

Results on `98ef4bb`:

- `pnpm install --frozen-lockfile`: succeeded with the lockfile unchanged.
- `pnpm test`: 43 files, 267 tests, all passed.
- `pnpm build` (route generation, `tsc --noEmit`, `vite build`): succeeded. One warning: `StudioStage` chunk is 1,033 kB minified (281 kB gzip). It is tracked by the renderer budget task #169.

Environment variables:

- `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash/Vercel KV). Optional: without them, `api/designs` and `api/waitlist` use memory, and seed looks still load.
- `CHROME_PATH`: optional, only for the still/OG bake scripts.
- No Supabase, auth or storage configuration exists yet (F08 #143, A01 #145).

Reproducibility gaps:

- `package.json` had no `packageManager` field, so the pnpm version was not pinned. Pinned to `pnpm@12.15.0` on 10 Nov 2026 (P4). pnpm 12 then writes its own binaries into `pnpm-lock.yaml`, which pnpm 10 can't read, but Vercel reads the field and installs with pnpm 12.15.0 (checked with a preview deployment of the P4 branch), and CI's `pnpm/action-setup` takes the version from it.

## Uncommitted work at audit time

The working copy on `flv/mockup-fidelity-studio` had 16 changed files of landing → studio handoff work (about 1.5k lines). It is preserved without reset as commit `155264c` on `flv/landing-handoff`. It is not merged.

On that branch `tsc --noEmit` passes. Two tests in `src/lib/landing-handoff.test.ts` fail with `sessionStorage is not defined`, because that test file needs a DOM environment. This failure is not on `master`, so it is a fix for that branch before it merges, not a baseline defect.

## Reusable capabilities (reuse and verify, do not rewrite)

| Capability | Where | PRD relevance / gap |
| --- | --- | --- |
| Canonical document: four panels (`front`, `back`, `left`, `right`); paint/graphic/text/art/pattern layers; strokes (brush/eraser/fill) | `src/lib/design-document.ts` | Base for schema v2 (#139). The current parsers return `null` and drop invalid layers silently, which v2 must replace with path errors. There is no `schemaVersion` and no pinned template ref. |
| Patterns `stripe`, `check`, `gradient` | `design-document.ts` | E10 #161 needs Solid/Stripes/Check as base presets |
| Command store / undo | `src/lib/design-commands.ts`, `editor-store.ts` | E01 #152, E09 #160 |
| Panel UV mapping and atlas painting | `panel-uv.ts`, `paint-atlas.ts`, `paint-layout.ts`, `tee-geometry.ts` | R01 #164, R02 #165 |
| 3D studio stage | `src/components/scene/StudioStage.tsx` | R03–R06 #166–#169 |
| Local draft and snapshots (browser storage) | `design-draft.ts`, `design-snapshots.ts` | Guest-only; is not account persistence. S05 #174 replaces it with owner-scoped recovery |
| Design board persistence: one KV key holding all designs with a revision counter | `designs-store.ts`, `designs-persist.ts`, `api/designs.ts` | Superseded by Supabase F08 #143 and S03 #172 |
| Publish → `/look/:id`, OG card, crawler rewrite | `routes/look.$lookId.tsx`, `api/og*.ts`, `vercel.json` | P01–P06 #179–#184; no revocation or pinned revision |
| Published-document sanitizing | `sanitizePublishedDocument` in `design-document.ts` | Input to P07 #185 |

## Paths to retire (F09 #144)

Guest publishing (`POST /api/designs` with no account), the vote endpoint (`/api/designs/:id/vote`, retired in V1: it answers 410 and votes are by account on `/s/:slug`), `routes/vote.tsx`, the board ranking (`rank-designs.ts`, `vote-board.ts`) and challenges. These stay as historical references (#75, #96, #108) and are not alpha acceptance.

## Follow-ups

`master` has no failing checks, so F01 needs no new defect issues. The open items are already tracked:

- Bundle size → #169.
- The landing-handoff test environment → fix on `flv/landing-handoff` before it merges.

## Renderer budgets (R06 #169)

Measured 30 October 2026 on `03f6f07` plus the #168 change (the WebGL guard adds about 1 kB). Production build served by `vite preview` (gzip on), Chrome on an Apple M3 laptop (16 GB, ANGLE Metal), viewport 1440×900 at DPR 2, cold cache, `/create?step=design` with the default garment.

### First load of the editor

| What | Transferred | Notes |
| --- | --- | --- |
| JS, all chunks for `/create` | 489 KiB gzip (1.77 MB minified) | 18 app chunks plus the 12 KiB Draco wrapper |
| ↳ `StudioStage` chunk (three.js, R3F, drei) | 269 KiB gzip (1,020 kB minified) | The only chunk over Vite's 500 kB warning |
| ↳ `index` (React, router) | 94 KiB gzip | |
| ↳ `supabase-client` | 54 KiB gzip | |
| ↳ `create` route | 25 KiB gzip | |
| Draco decoder (`draco_decoder.wasm`) | 188 KiB | |
| GLB | 907 KiB (`garment.glb`) | Preloaded by `Garment.tsx` for the default gown even when another garment is picked; `tee.glb` is 90 KiB |
| Textures | 5 KiB (five fabric PNGs) | |
| CSS + fonts | 9 KiB + 37 KiB | |
| **Total** | **≈1.6 MiB** | |

All JS in `dist/assets` (every route) was 492 KiB gzip; the largest chunk was `StudioStage` at 269 KiB. For today's figures see Budgets below.

### Editor frame time

600 `requestAnimationFrame` intervals on the design step, 3D pane 1001×1186 device px, idle orbit:

| Mode | Median | p95 | Max |
| --- | --- | --- | --- |
| Normal (vsync) | 16.7 ms | 16.8 ms | 16.8 ms |
| Uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`) | 2.4 ms | 3.8 ms | 17.6 ms |

So the editor holds 60 fps with about 4× headroom on this machine. Headless Chrome; the uncapped figure is the useful regression signal.

### Drawing a stroke (A2, 10 Nov 2026)

The 2D panels and the tee each redraw the atlas for every point of a live stroke. Atlas work per frame, in Node on the development laptop (Apple silicon), for a tee with a stripe base and on each panel two images plus two paint layers of eight strokes, while a 40-point brush stroke grows on the front:

| Atlas | Before A2 | Full redraw after A2 | Live stroke, cached | 
| --- | --- | --- | --- |
| 512 px, new layer | 4,178 ms | 87 ms | 2.5 ms |
| 512 px, translucent top layer | 1,963 ms | 84 ms | 3.6 ms |
| 1024 px, new layer | — | 340 ms | 10.0 ms |
| 1024 px, translucent top layer | — | 341 ms | 14.8 ms |

Two changes, both pixel-identical (`atlas-goldens`, `stroke-cover.test.ts`, `live-atlas.test.ts`):
- **Each stroke covers each pixel once** instead of stamping a full disc every 0.7 px; opaque ink and erasers set a pixel outright, so the overdraw changed nothing but time.
- **What lies under a live stroke is cached at pen-down** (`createLiveAtlas`), so each frame copies it and draws only the stroke. `VITE_FLP_LIVE_STROKE_CACHE=false` turns the cache off.

The numbers are atlas work only, before the canvas upload and the WebGL frame. Still to record: the same stroke on a real iPad, and frame time in the browser, both for the 1024 px decision (X1).

### Budgets

Refreshed 10 November 2026 (P4) on the P4 branch, which is `master` at `34808bf` plus the lazily loaded Web Vitals chunk (3 KiB). `master` alone is 531.2 KiB of JS, so the 492 KiB above is out of date: the studio overhaul (rc.6) moved code out of `StudioStage` and into shared chunks.

| Budget | Limit | Today | Enforced |
| --- | --- | --- | --- |
| All JS, gzip | 876 KiB | 566.5 KiB (#372); 571.0 KiB with the graphics library (#373); 602.9 KiB with Pattern (beta) built in (16 Nov); 640.9 KiB with the Vote feed and layer panel (#401), about 648 KiB with the fabric, fill and stretch tools (17 Nov); 668.0 KiB with the polish and vote work (20 Nov); 684.6 KiB with panel zoom and Download image (27 Nov); 688.9 KiB locally with the share page's 3D view (#437, 27 Nov); 861.9 KiB locally with PostHog product analytics, about 170 KiB of it lazy and loaded only when `VITE_POSTHOG_KEY` is set (28 Nov) | CI `check` job, `scripts/check-budgets.mjs` |
| Largest JS chunk, gzip | 310 KiB | 173.2 KiB (`StudioStage`) | CI `check` job, `scripts/check-budgets.mjs` |
| GLB per garment template | 1.2 MiB | 1.19 MiB max (`coat.glb`, 1,214 KiB, with print UVs, 11 Nov; was `tailored.glb`, 1,149 KiB) | CI `check` job, `scripts/check-budgets.mjs` |
| Editor first load, all bytes over the wire | 2.0 MiB | 611 KiB (the tee editor, signed in, cold cache) | CI browser tests, `e2e/budgets.spec.ts` |
| Editor frame time on a laptop-class GPU | p95 ≤ 16.7 ms (60 fps); uncapped p95 ≤ 8 ms | 16.8 / 3.8 ms (30 Oct) | Manual |
| Editor frame cost on CI (software WebGL), p95 of animation-frame callbacks | 8 ms | 1.1 ms (median 0.5 ms, 384 frames; first CI run of #344) | CI browser tests, `e2e/budgets.spec.ts` |

All limits live in `scripts/budgets.json`. Raising one is a deliberate change: update that file and this table in the same commit. On 12 Nov the all-JS limit went from 570 to 600 KiB. The first tester's feedback added about 32 KiB of real features: two-finger gestures, the selection toolbar, side shapes, the Create page, rankings, the template upgrade and the landing's real tee. The graphics library (#373) and shape editing (#374) then reached 571 and 570.3 KiB. Trimming that much would have meant dropping features. The largest-chunk and first-load budgets are unchanged and well inside their limits. The all-JS limit now has only about 7% headroom, not 15%. Lazy chunks count toward it as well, so a new route or library has to fit.

On 16 Nov the all-JS limit went from 600 to 640 KiB for Workflow 1 (pattern editing and the cloth drape). With `VITE_PATTERN_BETA=true`, as the e2e build sets it, all JS is 602.9 KiB. Every part of Pattern (beta) is a lazy chunk that loads only when a design uses it:
- the cloth worker, 6.9 KiB;
- the pattern templates, 4.2 KiB;
- the editor, 4.1 KiB;
- mesh storage, 2.7 KiB;
- the draped garment, 1.9 KiB;
- starting a pattern, 0.6 KiB.

The editor's first load and the largest chunk don't change. The new limit also covers the AI assist dialog (behind its own flag) and leaves about 6% headroom.

On 17 Nov the all-JS limit went from 640 to 664 KiB for the founder's second round of feedback: the editable landing demo (#399), reliable drag and drop (#400), the separate Vote feed and the layer panel (#401), the fabric picker and section fills (#402), and stretching one side with the re-baked tee (#403). Together they add about 19 KiB; with all of them the total is about 648 KiB. Each is either on the page it serves (the Vote feed, the landing's tee surface) or a small editor panel, and lazy chunks count toward this limit too, so trimming would mean dropping a requested feature. The largest chunk and the editor's first load stay well inside their own limits. The new limit leaves about 2.5% headroom over the expected total.

On 20 Nov the all-JS limit went from 664 to 680 KiB. CI measured 668.0 KiB after the polish and vote work: the signed-out studio path, structured feedback, head-to-head comparison, and the vote-signal client. Those pieces sit on the pages that use them (the studio, the share page, and Vote), and lazy chunks count toward this limit, so cutting 4 KiB would mean dropping one of them. The largest chunk stays inside its own limit. The new limit leaves about 12 KiB, roughly 1.8%, over the measured total.

On 27 Nov the all-JS limit went from 680 to 696 KiB. CI measured 684.6 KiB after zoom and pan on the flat panels and Download image (#438) were merged with the studio mode and UX review fixes (#435). The panel view maths, the zoom control and the export sheet sit in the studio, and lazy chunks count toward this limit, so lazy-loading them would not shrink the total. Cutting 4.6 KiB would mean dropping one of the two features. The largest chunk stays inside its own limit. The new limit leaves about 11 KiB, roughly 1.7%, over the measured total.

The share page's 3D view (#437) landed under that limit, with no raise of its own: 688.9 KiB measured locally, about 7 KiB under. Its viewer is a 2.0 KiB lazy chunk that loads only after the stills and reuses the studio's lazy chunks, plus about 1.5 KiB on the share route's own lazy chunk. Nothing new is eager.

On 28 Nov the all-JS limit went from 696 to 876 KiB for product analytics ([analytics.md](analytics.md)): 861.9 KiB measured locally. PostHog adds about 170 KiB gzip in three lazy chunks: the library (about 122 KiB), its session-replay recorder (about 47 KiB, bundled so that no script is loaded from PostHog and the CSP needs no script host) and the site's own wrapper (under 2 KiB). They load only when `VITE_POSTHOG_KEY` is set and the browser doesn't send Do Not Track or GPC, after the app has started, so the editor's first load and the largest chunk don't change, and a build without the key never fetches them. PostHog's slim build plus the needed extensions came to about the same size (its extension bundle repeats the core), so it isn't used. The new limit leaves about 14 KiB, roughly 1.6%, over the measured total.

The browser budgets run in the CI browser shards against the production build:
- **First load** reloads the editor of a new tee with the cache cleared and switched off. It then adds up every response's encoded size from the Chrome DevTools Protocol (`Network.loadingFinished`), headers included. That covers what the tee editor loads, including Supabase calls. It is lower than the 1.6 MiB above because the default gown is no longer preloaded on the editor.
- **Frame cost** times each `requestAnimationFrame` callback while the camera is dragged back and forth on Preview & Publish. That is the CPU work three.js and React Three Fiber do per frame (scene traversal, uniforms, draw calls). The GPU work runs after the callback, even with CI's software WebGL, so this is not a frame rate. The CI limit is about 7× the measured p95, enough to ignore runner noise but still catch a per-frame CPU regression such as rebuilding geometry or redrawing the atlas on every frame. The laptop frame-time row stays a manual check.

Cheap wins, not done here: drop the default-gown `useGLTF.preload` on the editor (saves ~900 KiB when another garment is chosen), and split `@supabase/supabase-js` out of the first paint.

## Save and public-page timing (S04 #173, P04 #182)

Measured 31 October 2026 with `e2e/measure.spec.ts` (`MEASURE=1`). Production build served by `pnpm preview` (API through the same middleware), local Supabase, headless Chromium on an Apple M3 laptop. Run it against any environment:

```bash
pnpm build && pnpm preview --port 5399
MEASURE=1 E2E_BASE_URL=http://localhost:5399 pnpm exec playwright test measure
```

| Measure | Result | Target | Status |
| --- | --- | --- | --- |
| Save acknowledgement (save request sent → response), 25 autosaves | p50 134 ms, p95 255 ms, max 291 ms | p95 ≤ 2 s | Met |
| Edit → "Saved to cloud" as seen, 5 edits | p50 2.36 s, max 2.75 s | 2 s quiet period by design, plus the acknowledgement | As designed |
| ↳ of which edit → save request (the quiet period) | p50 1.86 s | 2 s debounce | As designed |
| First public image, Fast 3G (562 ms RTT, 1.44 Mbit/s), cold cache, 390×844 | 4.6 s → **2.14 s** | ≤ 3 s | **Met** (#182, 31 Oct) |
| First public image, Fast 3G, 1366×768 | 4.1 s → **2.13 s** | ≤ 3 s | **Met** |
| First public image with five views (#179), Fast 3G, 390×844 | **2.14 s** | ≤ 3 s | **Met** (1 Nov) |
| First public image with five views (#179), Fast 3G, 1366×768 | **2.13 s** | ≤ 3 s | **Met** (1 Nov) |
| On staging, functions in Virginia: save p95, first image at 390×844 and 1366×768 | 1.67 s, **3.09 s, 3.72 s** | ≤ 2 s, ≤ 3 s | **First image missed** (4 Nov) |
| On staging, functions in Dublin, two runs: save p95 | **0.88 s, 0.58 s** | ≤ 2 s | **Met** (4 Nov) |
| On staging, functions in Dublin, two runs: first image, 390×844 and 1366×768 | **1.70 to 1.78 s** | ≤ 3 s | **Met** (4 Nov) |
| ↳ after the sleeve views were re-aimed at their sleeves, 390×844 / 1366×768 | **2.15 s** / **2.12 s** | ≤ 3 s | **Met** (1 Nov) |
| 0.9.0-rc.2 (e67e6c3), five views, 390×844 / 1366×768 | **2.15 s** / **2.13 s** | ≤ 3 s | **Met** (1 Nov) |
| 0.9.0-rc.2 as tagged (1193fcc), five views, 390×844 / 1366×768 | **2.14 s** / **2.14 s** | ≤ 3 s | **Met** (2 Nov) |
| 0.9.0-rc.3 as tagged (bb20395), five views, 390×844 / 1366×768 | **2.15 s** / **2.14 s** | ≤ 3 s | **Met** (2 Nov) |
| 0.9.0-rc.4 as tagged (8da86bf), five views, 390×844 / 1366×768 | **2.14 s** / **2.16 s** | ≤ 3 s | **Met** (3 Nov) |
| 0.9.0-rc.5 as tagged (5edc90c), five views, 390×844 / 1366×768 | **2.66 s** / **2.67 s** | ≤ 3 s | **Met** (4 Nov) |
| 0.9.0-rc.6 as tagged (e3c8ece), five views, two runs, 390×844 / 1366×768 | **1.45 s** / **1.43 s**, **1.42 s** / **1.42 s** | ≤ 3 s | **Met** (9 Nov) |

For 0.9.0-rc.2 (e67e6c3, 1 Nov), the same setup gave save acknowledgement p50 80 ms, p95 157 ms, max 280 ms (25 saves), and edit → "Saved to cloud" p50 2.05 s. On-demand rendering (#264) and per-layer eraser compositing (#274) didn't move any number.

On the tagged commit (1193fcc, 2 Nov), the same setup gave save acknowledgement p50 101 ms, p95 192 ms, max 232 ms (25 saves), and edit → "Saved to cloud" p50 2.03 s. The tagged commit adds only the word box width (#276), docs and the hosted-readiness kit (#275), so we read the higher save p95 as run-to-run noise. It's well within the 2 s budget.

On 0.9.0-rc.3 as tagged (bb20395, 2 Nov), the same setup gave save acknowledgement p50 63 ms, p95 75 ms, max 93 ms (25 saves), and edit → "Saved to cloud" p50 1.98 s. The commit doesn't change the save path, so we read the lower numbers as a quieter run.

On 0.9.0-rc.4 as tagged (8da86bf, 3 Nov), the same setup gave save acknowledgement p50 95 ms, p95 128 ms, max 141 ms (25 saves), and edit → "Saved to cloud" p50 2.06 s. The commit doesn't change the save path, and this run came straight after the full browser suite, so we read the higher numbers as run-to-run noise.

On 0.9.0-rc.5 as tagged (5edc90c, 4 Nov), the same setup gave save acknowledgement p50 58 ms, p95 88 ms, max 90 ms, and edit → "Saved to cloud" p50 1.95 s. First image rose about 0.5 s from rc.4 and stays under the budget; we haven't traced the cause. `e2e/measure.spec.ts` now fails above the targets.

On 0.9.0-rc.6 as tagged (e3c8ece, 9 Nov), the same setup gave, over two runs, save acknowledgement p50 64 and 91 ms, p95 86 and 135 ms, max 89 and 139 ms (25 saves each), and edit → "Saved to cloud" p50 1.97 and 2.00 s. Before #320 the studio overhaul had pushed the first image to 3.18 s and 3.19 s, over the budget. Taking the script preloads off a published design's page let the image load first. First image on staging wasn't re-measured for this candidate.

Re-measured 1 November 2026 after the sleeve views (#179), same setup (production build, `pnpm preview`, local Supabase, Apple M3); save acknowledgement in that run was p50 59 ms, p95 73 ms. Adding two views didn't move the first image: the front is still the only preload, and the sleeve images are `loading="lazy"` below the main three, so they don't compete with it on a slow link. The run also checks that the page and the pre-rendered overlay (JavaScript off) have no sideways scroll at 390 and 1366 px.

The 390 px public page shows the three main views stacked, the two sleeve views side by side under them ("Wearer's right", "Wearer's left"), then the disclaimer and the privacy link, with nothing clipped. At 1366 px the sleeves sit centred under the main row at the same tile size. Versions published with three views show no sleeve row.

**How the public page got under 3 s (#182):** the first image used to wait on four round trips in a row: HTML, then the app JS, then `/api/flp/public/:slug`, then the image. Now `/s/:slug` is served by the share page for every visitor (`src/lib/flp-api/share-page.ts`, through the `vercel.json` rewrite and the dev/preview middleware). It returns the app shell with:
- the share card in the head;
- `<link rel="preload">` for the front view;
- the public payload as a JSON data block (CSP-safe; it doesn't execute);
- the views (three, plus the sleeves when the version has them) pre-rendered as plain HTML in an overlay outside `#root`.

The image therefore downloads in parallel with the app, shows before React mounts, and the page removes the overlay once it has rendered. A frame-by-frame check showed no blank gap and no duplicate images. Timing starts at navigation commit and ends when the first `main img` has decoded; until 31 Oct the spec waited for the `load` event, which also counted the full JS download.

On a normal connection the first image appears in well under a second. These measurements are local; they need repeating on staging (#186).

These are dev-server figures only if `E2E_BASE_URL` is unset. The dev server loads hundreds of unbundled modules, so its public-page time (≈47 s on Fast 3G) is meaningless; always measure a production build.

## Print atlas size (11 Nov)

Template-built garments print through a 2048² atlas, so 16 MiB of RGBA on the GPU, plus mipmaps. The procedural tee uses 512² (1 MiB). Only the garment being designed holds an atlas. Real models are pattern pieces at true scale, and each panel needs its own rectangle at about 12–21 px/cm, so a 512 atlas would blur a print. If memory on low-end devices shows up in the frame-time check, the first lever is lowering `atlas` in a template's pieces file and rebuilding it.
