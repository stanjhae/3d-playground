# Requirements audit: 0.9.0-rc.2

Every acceptance statement of PRD v1.1 R01–R11 and R13–R17, plus the limits and sharing rules in sections 9 and 10, checked against what actually proves it. R12 (AI) isn't enabled in this alpha.

**Commit:** `v0.9.0-rc.2` (1193fcc), plus `e2e/requirements-proof.spec.ts` and the pattern picker fix from this PR.
**Environment:** local Supabase and Mailpit. Nothing here has run on a deployed path, which the PRD's definition of done requires (#186).
**Audited:** 2 Nov 2026.

## Result

rc.2 does **not** meet the PRD's definition of done yet. The core journey holds: private ownership, saving, history, publishing and revocation are all well proven. The gaps are below.

| Group | What's in it | Where it goes |
| --- | --- | --- |
| Behaviour that's wrong | Cleared public name stays on live pages; failed image doesn't block publishing; no `noindex` | Fix for rc.3 |
| The app differs from the PRD, no recorded decision | Input limits; no left, right or reset camera control; no off-panel warning; no stale preview state; autosave pruning; takedown | Owner decision |
| Works, but thin proof | See rows marked **Gap (proof)** | Add tests where the risk justifies it |
| Can't be checked locally | Deployed paths, real email, CDN, real budgets | #186 |

## How to read the status

- **Proven:** an automated test exercises it, and its assertions were read for this audit.
- **Checked by hand:** dated human evidence exists, but no automated test.
- **Hosted only:** can only be verified on a deployment (#186).
- **Owner:** needs a decision or action from the owner.
- **Gap (proof):** the code appears to do this, but nothing proves it at the level the PRD asks for. Each requirement is accepted on both canonical data and visible behaviour, so a data-level test alone is a proof gap.
- **Gap (behaviour):** the app doesn't do what the statement says.

Test layers: **UI** is a real browser; **API** is the real handler with real Supabase and JWTs; **DB** is pgTAP; **pixel** is the real atlas rasterizer; **store** is the editor store or command engine; **unit** is a pure function.

A closed issue doesn't count as evidence, and neither does the implementation existing.

## R01 Email code authentication

| Statement | Evidence | Status |
| --- | --- | --- |
| Valid email shows a neutral sent message | `requirements-proof` sign-in test (UI) | Proven |
| Doesn't reveal whether the account exists | `auth.test.ts` maps errors neutrally (unit); no real comparison of known and unknown emails | Gap (proof) |
| Resend countdown shows | `requirements-proof` (UI): disabled "Send a new code in Ns" | Proven |
| Resend sends a working new code | None clicks the resend button | Gap (proof) |
| Valid code creates a session | `helpers.ts` `signIn`, used by `journey.spec` (UI) | Proven |
| Returns to the intended safe internal page | `failures.spec` session expiry (UI) | Proven |
| Unsafe `returnTo` falls back | `auth.test.ts` (unit) only | Gap (proof) |
| Wrong code gives a clear recoverable error | `requirements-proof` (UI): message shown, then the right code works | Proven |
| Reused code gives the same | `requirements-proof` (UI): a used code is refused, the fresh one works | Proven |
| Expired code gives the same | `auth.test.ts` with a synthetic `otp_expired` (unit) | Gap (proof) |
| Paste works | `requirements-proof` types a spaced code by keyboard; `auth.test.ts` normalizes; no real paste event | Gap (proof) |
| Keyboard works | `requirements-proof` (UI): both steps by keyboard | Proven |
| Sign-out removes the session on this browser | `requirements-proof` (UI): `flp-auth` gone, email off screen, `/studio` redirects | Proven |
| Sign-out revokes the session on the server | Uses local scope; untested | Gap (proof) |
| Recovery data hidden from the next account | `isolation.spec` (UI) | Proven |
| No code or token in logs | No test watches console or server output | Gap (proof) |
| No code or token in analytics | `events.integration.test.ts` allowlist (API); no sign-in flow captured | Gap (proof) |

## R02 Design ownership and studio

| Statement | Evidence | Status |
| --- | --- | --- |
| Create or list needs a verified session | `flp-api.integration`, `routes.integration` (API) | Proven |
| Owner comes from the session | `flp-api.integration`, `contract.test.ts` (API, unit) | Proven |
| New design is private | `flp-api.integration` (API) | Proven |
| Lists and opens on a second signed-in browser | `requirements-proof` (UI): separate sign-in by code, list, open, content shown | Proven |
| Rename accepts 1 to 80 characters | `contract.test.ts` (unit), `accessibility.spec` 80 characters (UI) | Proven |
| Rename refuses blank and over 80 | `design-details.integration` (API), `contract.test.ts` (unit) | Proven |
| Description accepts at most 500 | Refusal at 501 proven (`contract.test.ts`, DB); exact 500 untested; no owned-studio field found | Gap (proof) |
| B can't read A's design: app, API, REST, storage | `isolation.spec` (UI), `routes.integration` (API), `flp_isolation.test.sql` (DB), `assets.integration` signed URL (API) | Proven |
| B can't change A's design: API | `routes.integration` with state compared, `design-details.integration` (API) | Proven |
| B can't change or delete directly (REST, storage) | Insert into A's storage prefix refused (DB); other direct writes are tried as A and rely on revoked grants | Gap (proof) |
| B can't delete: API | `design-details.integration` (API) | Proven |
| B can't enumerate: API, DB, studio | `flp-api.integration` (API), `flp_core_schema.test.sql` (DB), `requirements-proof` (UI) | Proven |
| Delete asks for confirmation | `journey.spec` (UI) | Proven |
| Confirmation names the design | Heading `Delete "<title>"?` seen in the running app on 2 Nov; no test asserts it | Checked by hand |
| Delete immediately removes sharing | `journey.spec` (UI), `design-details.integration` (API) | Proven |
| Delete queues storage cleanup | Removed synchronously (API test); a failed removal is only logged | Gap (proof) |
| Assets referenced by history aren't collected | No negative test; `cleanup-orphans --delete` is untested | Gap (proof) |

## R03 Template and colour

| Statement | Evidence | Status |
| --- | --- | --- |
| Exactly one T-shirt template selectable | `journey.spec` opens one; nothing asserts it's the only one | Gap (proof) |
| Base colour updates intended meshes, keeps artwork | No tee-level test; the base command is covered, not colour on meshes | Gap (proof) |
| Front, back, three-quarter presets | Bar exists; `capture-framing.test.ts` frames them (pixel); no click test | Gap (proof) |
| Left and right presets | Captures use them; **no control in `CameraPresetBar.tsx`** | Gap (behaviour), Owner |
| Orbit available | Bar offers Orbit; no behaviour test | Gap (proof) |
| Reset available | **No reset control**; picking a preset is the nearest thing | Gap (behaviour), Owner |
| Left/right wearer-labelled in tabs and mapping | `panel-orientation.test.ts`, `capture-framing.test.ts`, public alt text in `journey.spec` | Proven |
| Template version pinned on save | `template-manifest.test.ts`, `restore-projection.test.ts` (store) | Proven |
| Old design opens with original mapping | `restore-projection.test.ts` (pixel) | Proven |
| Or explicit unsupported-version message | Resolver tested (unit); the screen isn't | Gap (proof) |
| No implied size or fit claims | Disclaimer on the public page (`journey.spec`); `docs/claims-audit.md` by hand | Checked by hand |

## R04 Graphic and text creation

| Statement | Evidence | Status |
| --- | --- | --- |
| Add graphics and text on all panels | Store tests for all; UI for text on back and front | Gap (proof) |
| PNG and JPEG up to 10 MB and 4096×4096 accepted | Validator and small upload (API); exact limits and the file input untested | Gap (proof) |
| Oversized, malformed, animated, unsupported rejected with reasons | `image-validate.test.ts` (unit), spoofed SVG (API); UI message untested | Gap (proof) |
| Natural aspect ratio preserved | `uploaded-images.test.ts` (store) | Gap (proof) |
| Two bundled font faces | `glyph-coverage.test.ts`, `text-faces.test.ts` (unit) | Gap (proof) |
| Text colour | v1 command test only | Gap (proof) |
| Up to 32 characters | **Enforced limit is 280** | Gap (behaviour), Owner |
| Unsupported glyphs flagged before save | `editor-glyphs.test.ts` (store); message not rendered in a test | Gap (proof) |
| Failed asset gives a placeholder, object kept | `render-parity.test.ts` (pixel) | Proven |
| Failed asset blocks publishing | **`missingAssets` has no consumer; publish only checks WebGL** | Gap (behaviour) |

## R05 Object manipulation and layers

| Statement | Evidence | Status |
| --- | --- | --- |
| Move, resize, rotate handles | `layer-hit.test.ts` (unit); handles not asserted visible | Gap (proof) |
| Numeric controls | `transform-fields.spec` (UI) | Proven |
| Uniform resize | `transform-parity.test.ts` (pixel) | Gap (proof) |
| Reflected in both views, survives reload | Fields follow drag (UI), atlas parity (pixel), reopen (store); 3D never inspected | Gap (proof) |
| Duplicate creates a new ID | `requirements-proof` (UI): two ids in the saved document | Proven |
| Delete gives matching compositing | Document only | Gap (proof) |
| Hide and show | `requirements-proof` (UI, data), `publish-parity.test.ts` (pixel) | Proven |
| Reorder | `requirements-proof` (UI, data); no pixel-order test | Gap (proof) |
| Object belongs to exactly one panel | `canonical-document.test.ts` (unit) | Proven |
| Switching panels preserves values | Only the active-panel state is tested | Gap (proof) |
| Panel masks clip content | Sleeve edges (pixel); no edge test for text, images or front and back | Gap (proof) |
| Warning for fully off-panel object | **No warning in the app** | Gap (behaviour), Owner |
| Handles never in published output | `export-chrome.test.ts` (pixel) | Proven |

## R06 Undo and redo

| Statement | Evidence | Status |
| --- | --- | --- |
| A drag is one command | `transform-fields.spec` (UI) | Proven |
| A stroke is one command | `editor-history.test.ts` (store) | Proven |
| At least 50 commands undoable | `editor-history.test.ts` (store) | Proven |
| Redo works, cleared by a new edit | `requirements-proof` redo button (UI), `editor-history.test.ts` (store) | Proven |
| Colour, text, transforms, add, delete, order covered | Transforms and pattern (UI), the rest (store); layer-delete undo not found | Gap (proof) |
| Undo never affects publication state | No test | Gap (proof) |
| Reload opens the last saved revision; stack not persisted | `journey.spec` (UI), `canonical-commands.test.ts` | Proven |

## R07 Synchronized rendering

| Statement | Evidence | Status |
| --- | --- | --- |
| Preview uses the same document as 2D | `editor-canonical.test.ts`, `render-parity.test.ts` (pixel); no 2D-to-3D comparison | Gap (proof) |
| Reports loading or stale until the latest revision is rendered | **No revision-tied state**. `docs/decisions.md` defers #164 but doesn't waive this statement | Gap (behaviour), Owner |
| Delayed older decode can't overwrite a newer preview | By reading: a superseded batch is dropped and composition uses the latest document. No test | Gap (proof) |
| Landmark and orientation fixtures on four panels | `template-manifest.test.ts`, `panel-orientation.test.ts` | Proven |
| Transparency and transform fixtures | Stroke and layer alpha, front and back transforms (pixel); no image alpha, no sleeve transforms | Gap (proof) |
| WebGL failure leaves editing and 2D save available | State machine only (unit); no browser test | Gap (proof) |
| Missing 3D preview clearly labelled | Copy constants only | Gap (proof) |

## R08 Saving and recovery

| Statement | Evidence | Status |
| --- | --- | --- |
| Autosave after 2 s, coalesced | `save-controller.test.ts` (store, fake timers) | Proven |
| Explicit Save flushes immediately | `save-controller.test.ts`; the "Save now" button is never clicked | Gap (proof) |
| "Saved to cloud" only after acknowledgement for that revision | `failures.spec` (UI), `save-controller.test.ts` | Proven |
| Failed or paused saves never show Saved | `failures.spec` (UI) | Proven |
| A retry creates at most one revision | `flp-api.integration` (API), `failures.spec` same key (UI) | Proven |
| Reopening gets the latest acknowledged revision | `flp-api.integration` (API), `journey.spec` reload (UI), `requirements-proof` second browser (UI) | Proven |
| Uploads finish before a revision commits | `assets.integration` (API), `save-controller.test.ts` (store) | Proven |
| Offline edits labelled local | `failures.spec` (UI); server-stopped run by hand on 2 Nov | Proven |
| Local edits recover after reload | `failures.spec` with network up; never offline edit then reload | Gap (proof) |
| No overwrite of newer cloud work without resolution | Online two-tab conflict proven (UI, API); offline, newer cloud, reconnect never run | Gap (proof) |

## R09 Version history

| Statement | Evidence | Status |
| --- | --- | --- |
| Timestamped revisions and named checkpoints | `history.integration` (API), `journey.spec` (UI) | Proven |
| Restore A creates C equal to A, referencing A; A and B intact | `history.integration` (API), `flp_core_schema.test.sql` (DB) | Proven |
| Named and published revisions retained | Published proven (DB); the checkpoint in that test is unnamed | Gap (proof) |
| 20 designs per account, clear error | `quotas.integration` (API); UI message untested | Gap (proof) |
| 100 named checkpoints, clear error | `flp_quotas.test.sql` (DB) only; message untested | Gap (proof) |
| 100 recent autosaves | `flp_quotas.test.sql` (DB) | Proven |
| Content never silently evicted | **Older autosaves are pruned with no notice.** The PRD's alternative is to keep all revisions within quota | Gap (behaviour), Owner |

## R10 Publish and anonymous view

| Statement | Evidence | Status |
| --- | --- | --- |
| Private by default, cloud designs | `flp-api.integration` (API) | Proven |
| Private when a legacy field is absent | Cloud column is required. The legacy look store treats missing as public (`design-visibility.test.ts`) and still serves by link | Gap (behaviour), Owner |
| Publish uses a specific immutable version | `publication-races.integration` (API), `flp_core_schema.test.sql` (DB) | Proven |
| Ready renders required | `publication.integration` (API) | Proven |
| Served bytes match the recorded hash | `publication.integration` replaced view (API) | Proven |
| Manifest matches the version's content hash and renderer and template versions | Reported as missing: hashes cover image bytes only. Deferred in `docs/decisions.md` (#179) | Gap (behaviour), Owner |
| Page shows title, optional name, preview images | `journey.spec` (UI), `publication.integration` (API) | Proven |
| Derived 3D atlas | Not enabled; `view=atlas` returns 404 (API) | Proven |
| No email, full design JSON, draft history or sign-in | `journey.spec` (UI), `publication-races.integration` (API) | Proven |
| No source uploads | Key allowlist and blocked storage (API, DB); no published fixture contains a real upload | Gap (proof) |
| Draft edits don't change the page until republish | `publication.integration`, `design-details.integration` (API) | Proven |
| A second browser verifies the same source version | Separate context in `journey.spec`, without comparing `seq` | Gap (proof) |

## R11 Unpublish and deletion

| Statement | Evidence | Status |
| --- | --- | --- |
| Denies new HTML, API and media at once | `journey.spec` (UI), `publication.integration`, `publication-races.integration` (API) | Proven |
| Denies old rendition IDs | `scripts/hosted-check.mjs` only, on demand | Gap (proof) |
| Denies crawler endpoints | `publication-races.integration` (API), `og-card.test.ts` | Proven |
| No-store on data and media | `publication.integration`, `journey.spec`; published page and JSON 404 via the script only | Gap (proof) |
| No-store holds through the CDN | `hosted-check.mjs`, no hosted run yet | Hosted only |
| Open pages and downloads disclosed | Copy exists; not asserted | Gap (proof) |
| Failed unpublish shows an error | Code shows "Still published"; no test | Gap (proof) |
| Deleted and nonpublic links give the same neutral page | Same heading (UI); bodies never compared | Gap (proof) |

## R13 Scope honesty and accessibility

| Statement | Evidence | Status |
| --- | --- | --- |
| Concept, sample, ranking and media labels | `docs/claims-audit.md`; #199 questions open | Checked by hand, Owner |
| No fit, fabric, manufacturing or traction claims | Disclaimer test (UI); absence only by hand; nothing stops a removed claim returning | Checked by hand |
| Login by keyboard | `requirements-proof` (UI) | Proven |
| Save, history and sharing by keyboard | Rename and numeric fields only | Gap (proof) |
| Labelled controls | Role-name locators and axe on most screens; code step, history panel and publish step never scanned | Gap (proof) |
| Layers in an accessible list | `requirements-proof` uses it by role (UI), `layer-list.test.ts` | Proven |
| Numeric inputs replace dragging | `transform-fields.spec` (UI) | Proven |
| Focus stays visible | Global `:focus-visible` rule; sign-in fields set `focus:outline-none` with a border change; no test | Gap (proof) |
| Destructive actions name the design | Delete by hand (see R02). Unpublish has no confirmation; Restore names the version; Clear names the panel | Gap (behaviour), Owner |

## R14 Basic drawing and erasing

| Statement | Evidence | Status |
| --- | --- | --- |
| Brush with mouse or pointer | `panel-clear.spec`, `requirements-proof` (UI) | Proven |
| Selectable colour, width, opacity | Setters partly tested (store) | Gap (proof) |
| Stroke belongs to one layer and panel | `requirements-proof` all four panels (UI) | Proven |
| Clipped to its panel | Sleeves (pixel); front and back edges untested | Gap (proof) |
| Updates the 3D view | Frames requested (UI), atlas tested (pixel); ink on the garment not inspected | Gap (proof) |
| Eraser affects only the selected layer, keeps text and graphics | `erase-isolation.test.ts` (pixel), `requirements-proof` (UI) | Proven |
| Eraser can be undone | `requirements-proof` (UI) | Proven |
| Pointer-up is one undoable stroke | `editor-history.test.ts` (store) | Proven |
| Switching panel or tool keeps the stroke | `requirements-proof` four panels and tool switch (UI, data) | Proven |
| Save, restore and publication keep appearance | Round trip (pixel), restore (API); real captures never pixel-checked | Gap (proof) |
| Clear requires confirmation | `panel-clear.spec` (UI); per panel, not per layer | Proven |

## R15 Four-sided editing

| Statement | Evidence | Status |
| --- | --- | --- |
| Distinct marks on each panel appear only on their region | `panel-isolation.integration`, `publish-parity.test.ts` (pixel, paint only); labels in the matrix, by eye | Proven |
| Panel switching and save preserve all four | `requirements-proof` (UI, data) | Proven |
| Transformations preserve all four | Front and back only | Gap (proof) |
| Restoration preserves all four | `panel-isolation.integration` (API) | Proven |
| Wearer-side mapping explicit | `panel-orientation.test.ts`, `template-manifest.test.ts` | Proven |
| Side views imply no extra print surface | `sleeve-view-regions.test.ts` (pixel) | Proven |

## R16 Garment visual quality

Owner review approved on 1 Nov (comment on #166), from `e2e/visual-matrix.spec.ts` on 4631c16 plus #271. The matrix is opt-in, not in CI, and its screenshots aren't stored in the repo.

| Statement | Evidence | Status |
| --- | --- | --- |
| Readable silhouette at front, back, three-quarter | Owner review, #166 | Checked by hand |
| Readable from the side | Accepted limit: the tee reads very thin from exactly side-on | Owner |
| No detached pieces, holes, inverted normals | Owner review; `panel-orientation.test.ts` covers outward faces only | Checked by hand |
| Credible proportions, fabric surface, neutral lighting | Owner review | Checked by hand |
| Artwork legible, no stretching, mirroring, bleed | Mirroring and bleed proven (pixel); legibility by owner | Checked by hand |
| Editor and published framing consistent | `capture-framing.test.ts` (pixel); material settings not compared | Gap (proof) |
| Acceptance set, every preset at 1366×768, public at 390 | Matrix run on 1 Nov, stills only; repeat on the final candidate | Checked by hand |
| CTO reviews mapping; owner reviews against mockups | Owner approval recorded; no separate CTO record or mockup comparison | Owner |

## R17 Starter patterns

| Statement | Evidence | Status |
| --- | --- | --- |
| Choose Solid, Stripes or Check | `requirements-proof` (UI, data) | Proven |
| Select two pattern colours | **No separate control:** colours are the ground and the brush colour | Gap (behaviour), Owner |
| Deterministic fixed scale | `render-parity.test.ts` (pixel) | Proven |
| Applied to four regions, beneath artwork | `canonical-commands.test.ts`, `editor-canonical.test.ts` | Proven |
| Changing pattern preserves artwork | `requirements-proof` (UI, data) | Proven |
| Back to Solid restores the base, keeps artwork | `requirements-proof` (UI, data) | Proven |
| Save, reload, undo, redo reproduce it | `requirements-proof` (UI, data), `render-parity.test.ts` (pixel). **Found and fixed here:** the picker showed the wrong pattern after reload or undo | Proven |
| Version restore and publication reproduce it | Generic restore (API); check pattern in the matrix, by eye | Gap (proof) |
| Approved presets with stable IDs | Invalid kinds rejected (unit); IDs not pinned | Gap (proof) |

## Section 9 Performance and limits

| Statement | Evidence | Status |
| --- | --- | --- |
| Save acknowledgement p95 ≤ 2 s | `measure.spec` prints it: 192 ms locally. No threshold asserted | Hosted only |
| First public image ≤ 3 s | `measure.spec`: 2.14 s locally on Fast 3G | Hosted only |
| 50 layers | **40 per panel, 160 in total** | Gap (behaviour), Owner |
| 32 characters per object | **280** | Gap (behaviour), Owner |
| 2,000 stroke points in total | **4,096 per stroke, no total** | Gap (behaviour), Owner |
| 512 KB canonical JSON | **2 MB**, server side only | Gap (behaviour), Owner |
| 100 MB per account | `flp_quotas.test.sql` (DB); upload path untested | Gap (proof) |
| 10 MB per upload | `image-validate.test.ts` (unit) | Gap (proof) |
| Rejections visible; same limits on client and server | Notice state only (store); shared constants, no parity test | Gap (proof) |

## Section 10 Sharing and privacy

| Statement | Evidence | Status |
| --- | --- | --- |
| Public pages carry `noindex` | **No `noindex` or `robots.txt` anywhere** | Gap (behaviour) |
| Only a chosen name is shown; none invented | `publication.integration` (API), `og-card.test.ts` (unit) | Proven |
| Name is per account, capped, clearable on the profile | `design-details.integration` (API), `flp_design_details.test.sql` (DB) | Proven |
| Clearing the name removes it from live pages | **Publications keep their own copy; the studio says otherwise** (`PublicName.tsx`) | Gap (behaviour) |
| Email stays private | `journey.spec` (UI) | Proven |
| Report-contact route | `alpha-contact.test.ts` (unit); link vanishes without `VITE_FLP_CONTACT_EMAIL` (#195) | Owner |
| Operator takedown | Manual steps in `docs/deploy.md`; an owner may be able to republish afterwards | Gap (behaviour), Owner |
| Operator deletion finishes, is retryable | `delete-account.integration` (API, real script), `flp_account_deletion.test.sql` (DB) | Proven |
| Deleted account's token and public link stop working; uploads deleted | Not tested; the fixture has no uploads | Gap (proof) |
| Seven-day and thirty-day windows | No test; operational | Owner |
| Plain-language privacy page | Exists; copy not asserted; contact pending (#195) | Owner |

## Decisions the owner needs to make

Until each is decided, the row stays a gap. A decision to keep current behaviour goes in `docs/decisions.md`, because PRD section 13 asks for a recorded decision to change Must scope.

1. **Input limits:** change the code to the PRD's numbers, or record the current ones. Tightening could make existing designs read as over the limit.
2. **Left, right and reset camera controls (R03):** add them, or record the three presets plus orbit as enough.
3. **Fully off-panel warning (R05):** add it, or defer it.
4. **Stale and loading state (R07):** record that the #164 deferral also waives these statements, or build a small label.
5. **Autosave pruning (R09):** keep it and say so in History, or keep everything within quota, as the PRD allows.
6. **Legacy looks without a visibility field (R10):** confirm these are out of scope for the owned flow, or change the default.
7. **Takedown (section 10):** accept the manual step for a controlled alpha, or block republishing after an operator takedown.
8. **Two pattern colours (R17):** accept ground plus brush colour, or add a second picker.
9. **Unpublish without confirmation (R13):** accept it, since it can be undone by republishing the same link, or add one that names the design.
10. **Side view (R16):** the thin side-on view is already an accepted limit; record it against this statement.
