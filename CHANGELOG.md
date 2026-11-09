# Changelog

## 0.9.0-rc.6: alpha release candidate (9 Nov 2026)

The studio overhaul candidate. Four steps instead of six, Guided by default with a Pro tools switch, a white 3D stage, a new look across the site, and clearer sign-in failures. Delivered by #310–#318 and #320.

### Changed
- **Selected item is a properties panel:** Size and angle, then Colour, then, in Pro, Exact placement with position, opacity and Mirror to other side.
- **My Studio** shows designs as cards with a garment tile, the title, and Private or Published with an icon, three to a row on a laptop. The public name form and delete dialog match the new look.
- **New look, first step:** heavy sans headlines, a brighter red-to-orange brand on near-white, sentence-case controls and a new site header. Words on a garment keep their fonts.
- **Login on the landing goes to sign-in.** It used to jump to the waitlist.
- **Four steps instead of six:** Garment, Color & Pattern, Design, Preview & Publish, with a numbered stepper. Fit had nothing for the tee, and Preview and Publish are now one step. Old links to `?step=fit` and `?step=preview` still open the right step.
- **One main button per step, in the same place**: Use this garment, Continue, and Skip on the optional colour step. Back sits beside it.
- **Tools sit left of the panels on Design and right of the garment on every other step,** in one column that scrolls on its own, so nothing is cut off at laptop height. The camera views float over the bottom of the stage.
- **Try-on is opt-in.** Choosing a figure on Preview & Publish puts the tee on it, and choosing it again takes it off. Publishing takes the figure off first, so published pictures always show the tee alone. On phones and narrow tablets the try-on panel is hidden to keep publishing on screen, and the tee comes off the figure. A publish that stops short puts the figure back.
- **The studio's "Design / The house" switch** shows only in guest builds.
- **Guided by default, with a Pro tools switch.** Guided opens a new design on Garment, keeps one way to set the brush (Fine, Line, Bold), lets you drag, size and rotate a piece, and shows one hint at a time. Pro opens on Design and adds brush size, opacity and hardness, numeric position, mirroring to the other side, layer rename and duplicate, named checkpoints, Save this look and keyboard help, and turns the hints off. The switch is remembered on the device and never changes the design.
- **A tool rail replaces Draw / Tech:** Draw, Text, Graphics and Upload, each with its own panel; picking one changes only the panel shown. Selected item and Layers stay below.
- **Landing hero laid out as the mockup:** a three-line uppercase headline beside the live Draw, 3D and Graphics cards, one concept label for the cards, and a value strip with icons. Section headings are uppercase and the stage chips sentence case.
- **Every brand button** across the landing, My Studio, sign-in, the look page and the studio is sentence case and centred.
- **Each step says what it's for** in a heading and one line, as the mockups open each screen.
- **Garment step tells the truth:** a crew-neck, short-sleeve tee with four print areas, with named colours instead of hex codes. The tee is no longer called oversized or drop-shouldered, which its shape isn't.
- **Color & Pattern:** named colour swatches, the chosen colour shown by name and value, and pattern tiles that show their pattern.
- **Publishing** says Private or Published with an icon, and uses the shared buttons.
- **Pencil and palm:** once a pen has drawn, a resting hand no longer draws on the panels or on the tee. Pen pressure already reached both the panels and the tee.
- **Plain words:** Right sleeve and Left sleeve (named as worn), Selected item, Position, Rotate, Mirror to other side, Upload image, Layers, Serif, Medium and Large, Your text and Tap to place.
- **The 3D stage is a white studio, as in the mockups.** A white backdrop that greys slightly toward the floor, and a soft shadow, replace the dark stage, the tee fills about 70% of the frame instead of 37%, and the cloth has a project-made surface texture. The template is unchanged. Newly published pictures get the new look; stored ones stay as they were.

### Added
- **View buttons under the 3D on Design:** Front, 3/4, Back, both sleeves and Orbit, to check a side while designing.
- **Guides on the front and back panels:** a faint chest line, a centre line, and the collar band marked as not printing, measured on the template so they show where marks really land. Display only, never in the design or its pictures.
- **Shared UI parts** for buttons, tools, choices, swatches, sliders, panels and steps, with Lucide icons. The studio panels move onto them as they're rebuilt.

### Fixed
- **A shared design's first picture was over its 3 s budget on slow connections,** waiting behind the page's scripts. It now loads first; the page's controls follow a little later.
- **The Pro tools switch** no longer hides the P of its own label, and its knob stays inside the track.
- **On phones the tools covered the bottom of the tee.** The 3D stage now ends where the tools begin on every step, so the whole tee shows above them, and the tools scroll when a short screen leaves little room.
- **Moving between steps restarted the 3D preview,** replaying its intro and telling Publish the preview would be "back" when nothing was wrong. The canvas now stays mounted across steps, and while it starts Publish says so in muted text.
- **A page behind sign-in stayed blank when the sign-in service couldn't be reached.** It now says it's opening and, after 6 seconds, that it's still connecting, with Try again. It keeps waiting rather than sending a signed-in person to sign in.
- **A sign-in email that failed to send told people to check their connection.** It now says the code couldn't be sent, and an outage of the sign-in service no longer blames the connection either (#145).
- **The email limit for the hour said to wait a minute.** The message now says to try again in an hour if it keeps appearing (#145).

### Known limits for the alpha
- **The browser journey was not run on staging for this candidate.** The hosted check passed its other 11 checks with none failed, but the run had no way to read sign-in codes, so sign-in and the journey on staging were last proven on rc.5 (4 Nov). The studio overhaul has not been through them there.
- **First-image time on staging was not re-measured for this candidate.** The local production build gives 1.42 to 1.45 s on Fast 3G.
- **The first request after a sign-in can fail on the local stack.** When the database API has been quiet for 30 seconds or more, it can refuse a token issued moments earlier ("JWT issued at future", PGRST303), and that request returns a server error. In the demo walk the list retried and My Studio showed every design a second later. Not seen in any test failure, and not known whether staging does the same.
- **Marks near a side seam read narrower:** the torso is an oval, so shapes are true across the central half.
- **Brush dabs and base patterns draw in atlas proportions:** on a sleeve a dab looks about 1.7:1 tall, and a check's cells aren't square.
- **A very large design** may not fit the copy made as the page goes away, so an instant reload can still lose its last stroke.
- **After a full page navigation straight after a rename,** My Studio can briefly show the old name.
- **After sign-out,** a direct database read with the old access token can still work until it expires, at most an hour (`docs/decisions.md`, 3 Nov).
- **The remaining decisions** keep these differences from the PRD: the input limits, no reset camera, pruned autosaves, a manual takedown, two pattern colours from ground and brush, no confirmation on unpublish, and the thin side-on view (`docs/decisions.md`, 2 Nov).
- **Stored renders** don't carry a template or compiler revision, which needs a migration (part of #179).
- **WebKit stands in for recent Safari.** Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- **Local draft restore** re-imports on `@1`, so it loses the true-shape drawing. Cloud designs and their recovery aren't affected.
- **Owner items:** rights (#138), brand and product decisions (#198), the claims questions (#199), branch protection (#192), the operator for alerts (#193), and validation and pitch work (#196, #197, #200, #201).

## 0.9.0-rc.5: alpha release candidate (4 Nov 2026)

The freeze candidate. Closes the requirements audit's proof gaps, runs sign-in and the browser journey on staging for the first time, and fixes what that work found.

### Added
- **Description field** on a design (#304).
- **Off-panel note** when under 30% of a layer is on its panel. A layer's centre always stays on the panel, so none is ever fully off (#304).
- **Tool hints and an example design,** which opens as a private copy using only paint and text (#214, #304).
- **The 3D preview says when it isn't the whole design,** and publishing waits for it (#164, #302).
- **`pnpm demo:preflight`** checks everything the demo needs and says what to fix (#307).
- **Third-party notices,** linked from the privacy page (#303).
- **Proof tests** for the audit's remaining rows (#293 to #297, #306).

### Changed
- **Images and words keep their shape** on the 2D panel and on the tee, on new template `@3`. The panels take each region's real shape. Designs on older templates keep their look (#298).
- **One name:** Fashion Leader Vote, including the sign-in email (#303).
- **Only what the alpha can do is shown:** Gradient, non-tee shapes, sample stills, the sample board, cm sliders and sample sizes are hidden or gone unless concepts are on (#303).
- **Waitlist wording** offers news, with no invite or date (#303).
- **API functions run in Dublin,** next to the database. On staging, first public image went from 3.72 s to under 1.8 s (#306).
- **CI** splits the browser tests into two jobs, and keeps Supabase's ports free (#300, #307).

### Fixed
- **A drag on the tee outside the Design step painted on the saved design** instead of turning the view (#296).
- **A stroke followed at once by a reload was lost.** It's now offered back (#301).
- **A word still waiting for its font could be missing from a published picture** (#302).
- **Every refused upload said "This image cannot be used".** Each now gives its reason (#294).
- **A design that couldn't open still showed panels to draw on,** and those strokes went nowhere (#301).
- **The server stored template versions no app can open** (#301).
- **Enter in the word box did nothing** (#305).
- **The privacy page said three pictures,** and didn't mention pages already open (#293).

### Known limits for the alpha
- **Marks near a side seam read narrower:** the torso is an oval, so shapes are true across the central half.
- **Brush dabs and base patterns draw in atlas proportions:** on a sleeve a dab looks about 1.7:1 tall, and a check's cells aren't square.
- **A very large design** may not fit the copy made as the page goes away, so an instant reload can still lose its last stroke.
- **After a full page navigation straight after a rename,** My Studio can briefly show the old name.
- **After sign-out,** a direct database read with the old access token can still work until it expires, at most an hour (`docs/decisions.md`, 3 Nov).
- **The remaining decisions** keep these differences from the PRD: the input limits, no reset camera, pruned autosaves, a manual takedown, two pattern colours from ground and brush, no confirmation on unpublish, and the thin side-on view (`docs/decisions.md`, 2 Nov).
- **Stored renders** don't carry a template or compiler revision, which needs a migration (part of #179).
- **WebKit stands in for recent Safari.** Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- **Local draft restore** re-imports on `@1`, so it loses the true-shape drawing. Cloud designs and their recovery aren't affected.
- **Owner items:** rights (#138), brand and product decisions (#198), the claims questions (#199), branch protection (#192), the operator for alerts (#193), and validation and pitch work (#196, #197, #200, #201).

## 0.9.0-rc.4: alpha release candidate (3 Nov 2026)

Fixes from the rc.3 demo walk and the first hosted check, plus proof for the risky gaps in the requirements audit (`docs/evidence/requirements-rc.md`). No new migrations since rc.3.

### Added
- **Staging:** the Vercel Production environment is now staging, on its own Supabase project. A first hosted check is recorded in `docs/evidence/hosted-2026-11-03.md` (#287).
- **Proof tests** for access and accounts (#284), saving and data (#285), and the right public version (#288). The audit's Gap (proof) rows went from 65 to 42. The rest were judged lower risk and stay open.

### Fixed
- **API functions crashed on deploy** with a missing module, because their shared code wasn't included. rc.3 has this bug on Vercel; the local demo isn't affected (#286).
- **The steps over the dark 3D scene were hard to read.** The step labels, Continue and the design title were dark text on the dark scene. The header now has a solid background and the scene starts below it. Published images are unchanged (#289).
- **The Preview step's sleeve buttons were swapped** and framed the sleeve behind the page's controls. Published images weren't affected (#283).

### Known limits for the alpha
- Staging has no custom email (SMTP) yet, so sign-in can't work there: the Free tier refuses the code email template. The browser journey and real-inbox sign-in are unproven on staging, and the demo stays local (#186, `docs/decisions.md`, 3 Nov).
- After sign-out, the refresh token stops working and the app's API refuses the session straight away, but a direct database read with the old access token can still work until that token expires, at most an hour (`docs/decisions.md`, 3 Nov).
- The audit's ten decisions keep these differences from the PRD: the input limits, no reset camera, no off-panel warning, no stale preview state, pruned autosaves, a manual takedown, two pattern colours from ground and brush, no confirmation on unpublish, and the thin side-on view (`docs/decisions.md`, 2 Nov).
- WebKit stands in for recent Safari. Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- A stroke can be lost if the page reloads immediately after it, with no recovery prompt. With a gap of 100 ms or more, the prompt appeared and the stroke was kept (found in the rc.3 checklist).
- Deferred past the freeze: a revision-tagged atlas (#164).
- Owner items: rights (#138), the contact email (#195), branch protection (#192), the operator for alerts (#193), the claims-audit questions (#199), and validation and pitch work (#196–#201).

## 0.9.0-rc.3: alpha release candidate (2 Nov 2026)

Fixes and decisions from the requirements audit (`docs/evidence/requirements-rc.md`, `docs/decisions.md`, 2 Nov). One new migration since rc.2.

### Added
- **Left and right cameras:** the preview's camera bar now offers wearer's right and wearer's left, alongside front, three-quarter, back and orbit (#281).
- **History says what it keeps:** the 100 latest autosaves, plus every checkpoint, restore and published version (#281).
- **Requirements audit:** every PRD acceptance statement, with what proves it (#279).

### Fixed
- **Clearing your public name now takes it off live pages.** The studio already said so, but publications kept their own copy. A new name still waits for the next publish (migration `20261106090000_flp_clear_public_name`, #281).
- **A design with an image that hasn't loaded can't be published,** because the image would go public as a placeholder (#280).
- Public pages and images carry `noindex` (#280).
- The "not available" page's title no longer repeats the site name (#280).
- The pattern picker follows the design through undo, redo and reopening (#279).

### Known limits for the alpha
- Not hosted yet: staging and production need a hosted Supabase project (#186). The hosted checks are listed on that issue.
- The audit's ten decisions keep these differences from the PRD: the input limits, no reset camera, no off-panel warning, no stale preview state, pruned autosaves, a manual takedown, two pattern colours from ground and brush, no confirmation on unpublish, and the thin side-on view (`docs/decisions.md`, 2 Nov).
- WebKit stands in for recent Safari. Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- Found after the tag: the Preview step's two new sleeve buttons are swapped and frame the sleeve behind the page's controls. Published images aren't affected. Fixed for the next candidate.
- A stroke can be lost if the page reloads immediately after it, with no recovery prompt. With a gap of 100 ms or more, the prompt appeared and the stroke was kept (found in the rc.3 checklist).
- Deferred past the freeze: a revision-tagged atlas (#164).
- Owner items: rights (#138), the contact email (#195), branch protection (#192), the operator for alerts (#193), the claims-audit questions (#199), and validation and pitch work (#196–#201).

## 0.9.0-rc.2: alpha release candidate (1 Nov 2026)

Demo polish before the 12 Nov freeze (`docs/decisions.md`, 1 Nov), plus the visual matrix review and the last local P0 proofs. No new migrations since rc.1.

### Added
- **Sleeve views on the public page:** publishing captures five views (front, three-quarter, back, wearer's right and left sleeves). Designs published with three views stay public with those three (#179, #263).
- **Numeric transforms:** X, Y, size and turn fields in the Tech inspector. Typing, Enter or arrow keys (Shift for steps of 10) make one undo step each, and invalid values are refused with a message (#156, #262).
- **Import preview:** a design brought from the landing page shows before and after, with what changed, and is created only when you choose. Its images are uploaded to your account. A failed upload stops before anything is saved and offers to try again or create the design without that image (#141, #261).
- **Glyph validation** for the bundled text faces, plus restore fixtures for both template versions (#155, #165, #260).
- **Timing telemetry:** sampled save-acknowledgement and edit-to-render timings go through `/api/events`, name-only, with proposed alert thresholds documented (#193, #265).
- **Backup and restore rehearsal:** `scripts/backup.mjs` and `scripts/restore-check.mjs` dump the database and storage, restore them into a separate database and check sources, render hashes, revocations and deletions; the rollback runbook is in `docs/backup-restore.md` (#194, #266).
- **Proof tests** for independent panels through restore and publish, Clear and erase isolation, retryable account deletion, and the guest board closed on the server (#153, #159, #151, #144, #273).
- **Visual and browser matrix** (`VISUAL_MATRIX=1`): four tees, six camera angles and the public page at 390 px in Chromium and WebKit, reviewed and approved by the owner (#166, #191, #268).

### Changed
- **On-demand 3D rendering:** an idle studio draws nothing, so it uses far less CPU and battery. Two open tabs no longer slow each other down (#264).
- **Sleeve camera seats:** the wearer's left and right views look at the sleeve from behind and to the side, so the print reads (#269).
- **Base stripes and checks** use the picked colour at full strength instead of a 55% tint. Designs imported from the prototype keep their look (#271).
- **Landing claims:** the waitlist count, the free-access offer, "Premium finish" and "Studio-ready" are removed; fit, materials and the sample ranking are labelled as concepts. The audit is in `docs/claims-audit.md` (#199, #272).

### Fixed
- **The eraser only erases its own layer.** On a fully opaque paint layer it used to cut through the words, graphics, base pattern and paint beneath. The live preview while dragging now matches what is committed (#159).
- Landing designs' images could never upload, because the security policy blocks `fetch` on data URLs; they're now decoded directly (#261).
- The in-place word editor was as narrow as the word's frame, so a short word in large type scrolled inside it (found in the rc.2 demo dry run, #276).
- "Publish…" sometimes ignored the first click: a status line under the button disappeared as the 3D view loaded and moved the button mid-click (#270).

### Known limits for the alpha
- Not hosted yet: staging and production need a hosted Supabase project (#186). The hosted checks are listed on that issue.
- The tee reads very thin from exactly side-on; front, back, three-quarter and sleeve views are credible (owner review, #166).
- WebKit stands in for recent Safari. Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- Deferred past the freeze: a revision-tagged atlas (#164).
- The "not available" page's title repeats the site name ("Fashion Leader Vote — Fashion Leader Vote"); cosmetic.
- Owner items: rights (#138), the contact email (#195), branch protection (#192), the operator for alerts (#193), the claims-audit questions (#199), and validation and pitch work (#196–#201).

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
