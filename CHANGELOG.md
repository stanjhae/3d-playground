# Changelog

## Unreleased: 0.9.0-rc.2

Demo polish before the 12 Nov freeze (`docs/decisions.md`, 1 Nov).

### Added
- **Sleeve views on the public page:** publishing captures five views (front, three-quarter, back, wearer's right and left sleeves). Designs published with three views stay public with those three (#179, #263).
- **Numeric transforms:** X, Y, size and turn fields in the Tech inspector. Typing, Enter or arrow keys (Shift for steps of 10) make one undo step each, and invalid values are refused with a message (#156, #262).
- **Import preview:** a design brought from the landing page shows before and after, with what changed, and is created only when you choose. Its images are uploaded to your account. A failed upload stops before anything is saved and offers to try again or create the design without that image (#141, #261).
- **Glyph validation** for the bundled text faces, plus restore fixtures for both template versions (#155, #165, #260).

### Changed
- **On-demand 3D rendering:** an idle studio draws nothing, so it uses far less CPU and battery. Two open tabs no longer slow each other down (#264).

### Fixed
- **The eraser only erases its own layer.** On a fully opaque paint layer it used to cut through the words, graphics, base pattern and paint beneath. The live preview while dragging now matches what is committed (#159).
- Landing designs' images could never upload, because the security policy blocks `fetch` on data URLs; they're now decoded directly (#261).

## 0.9.0-rc.1: alpha release candidate (1 Nov 2026)

The first release candidate of the FLP PRD v1.1 alpha: an owned, signed-in T-shirt studio with cloud saving, history, and revocable public sharing. Everything below is verified against local Supabase and in CI. The hosted environment and the hosted checks are still to come (#186, checklist on that issue). Scope decisions and deferrals are in `docs/decisions.md`.

### Accounts and the studio
- Email-code sign-in with account-scoped sessions. A session the server rejects is refreshed once, otherwise ended (#221, #235).
- My Studio lists your designs, with rename, delete (with confirmation) and a public name (#229, #237).
- Owner isolation is enforced by row-level security and owner-checked write functions; another account gets a plain 404 (#222).
- Deleting an account removes its designs, history, publications and stored files (#231, #258, `scripts/delete-account.mjs`).
- In the alpha, the guest board and vote paths are retired and refuse writes on the server (#237, #249).
- Reads retry a brief server or network failure. A failed profile read no longer shows your public name as blank (found in the rc.1 demo dry run).

### Editing the T-shirt
- One canonical v2 document (`docs/canonical-document.md`) for the front, the back and both sleeves, named from the wearer's side. Draw and Refine share it, with one undo history (#216, #217, #223, #226, #227).
- Fixed: back prints read mirrored from behind (template `@2`); the Draw layout overlapped; sleeves were mislabelled (#239).
- Images upload privately and are validated on the server (PNG/JPEG only, no SVG or HTML, decompression bombs refused, metadata stripped) (#228).
- Limits are shown before a save could fail, and grouped undo/redo goes back at least 50 steps (#243).
- Keyboard: a layer list with move, hide and delete, arrow-key nudges, and undo shortcuts (#248).
- Clear asks first and clears only the panel you're drawing on. Words are never cut short. Uploaded images select by their real shape (#249, #250).
- Older designs open through an explicit import adapter, which explains what it changed (#219, #250).

### Saving, history and recovery
- Autosave after 2 s of quiet. One request at a time, one key per revision, conflicts shown as "Changed elsewhere" with a choice (#229).
- Save acknowledgement p95 is 110–255 ms locally (`docs/baseline.md`) (#252).
- History with named checkpoints, preview, and restore as a new version (#233).
- Local recovery per account, design and tab. One tab's save never drops another's unsaved copy, and a design opens even when browser storage is slow (#234, #255).
- Quotas (20 designs, 100 named checkpoints, 100 MB of uploads), autosave retention, and per-account rate limits with a paused-and-retrying save state (#241).

### Publishing and the public page
- Publish an exact saved version after reviewing it. Republishing keeps the link, and unpublishing or deleting a design ends it at once (#232).
- Public pages and images are never cached. The published title stays as published until you publish again (#249, #250).
- Open Graph link previews, with publication race tests (#236).
- The public page shows its first image in about 2.1 s on slow 3G (was 4.1–4.6 s) and works without WebGL (#257).
- Public images are served only if their bytes match the hash recorded at upload (#258).
- The disclaimer reads "Creator-supplied preview, not a certified fit or manufacturing render." (#250).

### Rendering
- Render parity for collar trim, brush and layer opacity, stripe and check spacing, and still framing; missing images show a placeholder (#254).
- If WebGL is lost or missing, the 2D panels keep working, and publishing explains why it can't capture views (#242).
- The Preview tee sits correctly on the fit mannequin (#240).

### Security, privacy and operations
- Content-Security-Policy and security headers on every route, cross-origin writes refused, and HTML-injection fixture tests (#253).
- A privacy page, "Report this design", and aggregate usage counts with no identifiers (#244).
- Runbooks:
  - deploy (`docs/deploy.md`, #246);
  - demo (`docs/demo.md`, `scripts/demo-reset.mjs`, a recorded fallback, #256);
  - orphan and account cleanup (#241, #258).

### Quality gates
- CI runs the typecheck, build, unit tests, a bundle-size budget, database (pgTAP) tests, API integration tests and the Playwright browser suite on every PR (#238, #242, #245).
- Coverage includes:
  - the failure-injection matrix (offline, 429, 500, reload races, two tabs, full storage, session expiry) and the route-by-route isolation table (#251);
  - an accessibility scan and overflow checks (#245, #258).

### Known limits for the alpha
- Not hosted yet: staging and production need a hosted Supabase project (#186).
- Deferred past the freeze: a revision-tagged atlas (#164), sleeve and four-view public renders (#179), and numeric transform inputs (#156).
- Owner items: rights confirmations (#138), the contact email (#195), branch protection (#192), the re-estimate (#137), and validation and pitch work (#196–#201).
