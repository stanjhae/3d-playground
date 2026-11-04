# Requirements audit: 0.9.0-rc.5

Every acceptance statement of PRD v1.1 R01–R11 and R13–R17, plus the limits and sharing rules in sections 9 and 10, checked against what actually proves it. R12 (AI) isn't enabled in this alpha.

**Commit:** audited on `v0.9.0-rc.2` (1193fcc), plus `e2e/requirements-proof.spec.ts` and the pattern picker fix from that PR. Rows are updated through `v0.9.0-rc.4` (8da86bf).
**Environment:** local Supabase and Mailpit. Since 4 Nov sign-in and the browser suite also run on staging; see the latest `docs/evidence/hosted-*.md` (#186).
**Audited:** 2 Nov 2026.

## Result

This audit was run on rc.2, and the rows have been updated for what landed since. Sign-in and the browser journey now run on staging, and no row is a Gap. The release still can't claim the PRD's definition of done alone: the validation sessions, rights and owner reviews are outside this audit's reach. The core journey holds: private ownership, saving, history, publishing and revocation are all well proven.

| Group | What's in it | Where it went |
| --- | --- | --- |
| Behaviour that was wrong | Cleared public name stayed on live pages; a failed image didn't block publishing; no `noindex` | Fixed for rc.3 (#280 and the cleared-name migration) |
| The app differs from the PRD | Input limits, cameras, off-panel warning, stale preview state, autosave pruning, takedown, and the rest of the ten | Decided by the owner on 2 Nov (`docs/decisions.md`). Left and right cameras and the History note were built |
| Works, but thin proof | Rows that were marked **Gap (proof)** | All closed by 4 Nov (#284, #285, #293 to #296, this PR). Those PRs also fixed what they found, including image proportions (template `@3`) |
| Can't be checked locally | Deployed paths, real email, CDN, real budgets | #186 |

## How to read the status

- **Proven:** an automated test exercises it, and its assertions were read for this audit.
- **Checked by hand:** dated human evidence exists, but no automated test.
- **Hosted only:** can only be verified on a deployment (#186).
- **Decided (2 Nov), Decided (3 Nov):** differs from the PRD, and the owner recorded that in `docs/decisions.md`. The app doesn't do what the statement says.
- **Owner:** needs a decision or action from the owner.
- **Gap (proof):** the code appears to do this, but nothing proves it at the level the PRD asks for. Each requirement is accepted on both canonical data and visible behaviour, so a data-level test alone is a proof gap.
- **Gap (behaviour):** the app doesn't do what the statement says.

Test layers: **UI** is a real browser; **API** is the real handler with real Supabase and JWTs; **DB** is pgTAP; **pixel** is the real atlas rasterizer; **store** is the editor store or command engine; **unit** is a pure function.

A closed issue doesn't count as evidence, and neither does the implementation existing.

## R01 Email code authentication

| Statement | Evidence | Status |
| --- | --- | --- |
| Valid email shows a neutral sent message | `requirements-proof` sign-in test (UI) | Proven |
| Doesn't reveal whether the account exists | `requirements-proof` (UI): a known and an unknown email get the same status, response body and screen; `auth.test.ts` (unit). Response time isn't compared | Proven |
| Resend countdown shows | `requirements-proof` (UI): disabled "Send a new code in Ns" | Proven |
| Resend sends a working new code | `requirements-proof` expired-code test (UI): after the countdown, the button sends a new code that signs in | Proven |
| Valid code creates a session | `helpers.ts` `signIn`, used by `journey.spec` (UI) | Proven |
| Returns to the intended safe internal page | `failures.spec` session expiry (UI) | Proven |
| Unsafe `returnTo` falls back | `requirements-proof` (UI): five unsafe forms land on the studio, nothing goes off-site, a safe path still works (failed when the check was removed); `auth.test.ts` (unit) | Proven |
| Wrong code gives a clear recoverable error | `requirements-proof` (UI): message shown, then the right code works | Proven |
| Reused code gives the same | `requirements-proof` (UI): a used code is refused, the fresh one works | Proven |
| Expired code gives the same | `requirements-proof` (UI): a real code aged past 10 minutes gets `otp_expired` and the same message (failed when the code wasn't aged). Local only: it ages the code in the database | Proven |
| Paste works | `requirements-proof` (UI): a real paste from the clipboard, with spaces, signs in | Proven |
| Keyboard works | `requirements-proof` (UI): both steps by keyboard | Proven |
| Sign-out removes the session on this browser | `requirements-proof` (UI): `flp-auth` gone, email off screen, `/studio` redirects | Proven |
| Sign-out revokes the session on the server | `flp-api.integration` (API, real sign-out): the refresh token is refused, the API answers the old access token with 401, and other devices stay signed in (failed when sign-out was removed) | Proven |
| A signed-out access token stops everywhere at once | Direct Supabase REST checks only the JWT, so until it expires (at most an hour) the old token still reads its owner's rows and can't write (`flp-api.integration`). Its owner's files follow the same read policy; that part is read from the policy, not tested. The app never uses it after sign-out. Kept as a known limit (`docs/decisions.md`, 3 Nov) | Decided (3 Nov) |
| Recovery data hidden from the next account | `isolation.spec` (UI) | Proven |
| No code or token in logs | `requirements-proof` (UI): console, page errors and the address bar during sign-in (failed when the code was logged). `flp-api.integration` (API): the handler's log output on accepted, refused and invalid requests. The code never reaches our API, as the UI test's requests show. Supabase Auth's own logs aren't checked | Proven |
| No code or token in analytics | `requirements-proof` (UI): every request during sign-in captured, including the real `signed_in` event; `events.integration.test.ts` allowlist (API) | Proven |

## R02 Design ownership and studio

| Statement | Evidence | Status |
| --- | --- | --- |
| Create or list needs a verified session | `flp-api.integration`, `routes.integration` (API) | Proven |
| Owner comes from the session | `flp-api.integration`, `contract.test.ts` (API, unit) | Proven |
| New design is private | `flp-api.integration` (API) | Proven |
| Lists and opens on a second signed-in browser | `requirements-proof` (UI): separate sign-in by code, list, open, content shown | Proven |
| Rename accepts 1 to 80 characters | `contract.test.ts` (unit), `accessibility.spec` 80 characters (UI) | Proven |
| Rename refuses blank and over 80 | `design-details.integration` (API), `contract.test.ts` (unit) | Proven |
| Description accepts at most 500 | `new-features.spec` (UI): the studio field takes 500 and stops there, and it's there after a reload; `design-details.integration` (API): exactly 500 is kept and 501 refused; DB refuses 501 | Proven |
| B can't read A's design: app, API, REST, storage | `isolation.spec` (UI), `routes.integration` (API), `flp_isolation.test.sql` (DB), `assets.integration` signed URL (API) | Proven |
| B can't change A's design: API | `routes.integration` with state compared, `design-details.integration` (API) | Proven |
| B can't change or delete directly (REST, storage) | `assets.integration` (API, B's real token): update and delete on all six tables, an insert, an RPC, and update, upsert, move, copy, download, sign and remove on A's upload and render, with A's rows and bytes compared (failed with a temporary grant and with temporary storage policies); `flp_isolation.test.sql` (DB) | Proven |
| B can't delete: API | `design-details.integration` (API) | Proven |
| B can't enumerate: API, DB, studio | `flp-api.integration` (API), `flp_core_schema.test.sql` (DB), `requirements-proof` (UI) | Proven |
| Delete asks for confirmation | `journey.spec` (UI) | Proven |
| Confirmation names the design | `claims.spec` (UI): the dialog is titled with the design's name, backing out keeps it, and confirming removes it | Proven |
| Delete immediately removes sharing | `journey.spec` (UI), `design-details.integration` (API) | Proven |
| Delete queues storage cleanup | There's no queue. `delete-account.integration` (API, injected storage failure): the delete still succeeds, the failure is logged, the files stay, and a `cleanup-orphans` dry run lists them. Someone has to run the cleanup; its `--delete` isn't run by a test, to keep the local store's files | Proven |
| Assets referenced by history aren't collected | `assets.integration` (API, real selection function): an upload only an old version uses isn't listed, an unplaced one is, and the first is listed once its design is gone (failed when references were ignored). `--delete` itself isn't run by a test | Proven |

## R03 Template and colour

| Statement | Evidence | Status |
| --- | --- | --- |
| Exactly one T-shirt template selectable | `requirements-proof` (UI): one create button, no picker, and the design is on the current `tee-crew-short`; the server refuses another template id | Proven |
| Base colour updates intended meshes, keeps artwork | `render-proof.spec` (UI, 3D pixels): the cloth changes colour, the figure's skin doesn't, and the stroke is still there | Proven |
| Front, back, three-quarter presets | `requirements-proof` clicks each (UI); `capture-framing.test.ts` frames them (pixel) | Proven |
| Left and right presets | `requirements-proof` clicks each (UI); `CameraPresetBar.test.ts` pins each to its panel's wearer side (unit); `capture-framing.test.ts` frames them (pixel) | Proven |
| Orbit available | `editor-controls` (UI): in Preview, dragging on the tee turns the view and leaves the saved design unchanged, and a preset takes it back. A drag used to paint on the design outside the Design step; fixed for this row (failed before the fix) | Proven |
| Reset available | No separate control; picking a preset is the nearest thing (decision 2) | Decided (2 Nov) |
| Left/right wearer-labelled in tabs and mapping | `panel-orientation.test.ts`, `capture-framing.test.ts`, public alt text in `journey.spec` | Proven |
| Template version pinned on save | `template-manifest.test.ts`, `restore-projection.test.ts` (store) | Proven |
| Old design opens with original mapping | `restore-projection.test.ts` (pixel) | Proven |
| Or explicit unsupported-version message | `requirements-proof` (UI): a design from a newer version shows the message and a way back, with no panels to draw on; the server refuses to store a version it doesn't know | Proven |
| No implied size or fit claims | `claims.spec` (UI): no cm or garment size on the landing, its stages or any studio step; the disclaimer on the public page. The cm sliders were removed on 4 Nov | Proven |

## R04 Graphic and text creation

| Statement | Evidence | Status |
| --- | --- | --- |
| Add graphics and text on all panels | `editor-controls` (UI): a word and a graphic on each of the four panels, saved and visible on that panel | Proven |
| PNG and JPEG up to 10 MB and 4096×4096 accepted | `limits.spec` (UI): each type at exactly 10 MB and at 4096×4096, through the file input, saved in the design | Proven |
| Oversized, malformed, animated, unsupported rejected with reasons | `limits.spec` (UI): one byte over, 4097 pixels, cut short, animated and SVG each show their own reason and add nothing. Every server rejection used to read "This image cannot be used"; fixed for this row | Proven |
| Natural aspect ratio preserved | `render-proof.spec` (UI): on template `@3` a square image measures 189×188 on the 2D panel and 65×64 on the tee, from the front camera; `render-proof.test.ts` (pixel): at any angle on all four panels; `limits.spec` (UI): the document keeps the ratio. It was 1.24:1 and about 0.74:1 until fixed on 4 Nov. Designs on older templates keep their look. Towards a side seam a mark reads narrower | Proven |
| Two bundled font faces | `editor-controls` (UI): both load from this site and draw differently; `glyph-coverage.test.ts`, `text-faces.test.ts` (unit) | Proven |
| Text colour | `editor-controls` (UI): the chosen colour is saved and appears on the panel | Proven |
| Up to 32 characters | Limit stays 280 (decision 1) | Decided (2 Nov) |
| Unsupported glyphs flagged before save | `limits.spec` (UI): the message names the character on screen, and nothing is saved | Proven |
| Failed asset gives a placeholder, object kept | `render-parity.test.ts` (pixel) | Proven |
| Failed asset blocks publishing | `publish-missing-image.spec.ts` (UI), `layer-images.test.ts` (unit) | Proven |

## R05 Object manipulation and layers

| Statement | Evidence | Status |
| --- | --- | --- |
| Move, resize, rotate handles | `editor-controls` (UI): the resize and rotate handles are drawn in the selection colour, and dragging each handle and the body changes the saved layer | Proven |
| Numeric controls | `transform-fields.spec` (UI) | Proven |
| Uniform resize | `editor-controls` (UI): after a resize, the image's measured shape on the panel stays within 5% and its aspect is unchanged; `transform-parity.test.ts` (pixel) | Proven |
| Reflected in both views, survives reload | `render-proof.spec` (UI, 3D pixels): a moved layer changes the 2D panel and the 3D view, and the 3D view matches after a reload | Proven |
| Duplicate creates a new ID | `requirements-proof` (UI): two ids in the saved document | Proven |
| Delete gives matching compositing | `render-proof.test.ts` (pixel): identical atlas to never having added the layer | Proven |
| Hide and show | `requirements-proof` (UI, data), `publish-parity.test.ts` (pixel) | Proven |
| Reorder | `render-proof.test.ts` (pixel): the other layer shows on top, and undo restores the exact atlas; `requirements-proof` (UI, data) | Proven |
| Object belongs to exactly one panel | `canonical-document.test.ts` (unit) | Proven |
| Switching panels preserves values | `editor-controls` (UI): each panel's word keeps its position and colour after switching back and forth | Proven |
| Panel masks clip content | `render-proof.test.ts` (pixel): images and words over all four corners of all four panels leave no ink outside the panel | Proven |
| Warning for fully off-panel object | `new-features.spec` (UI), `layer-hit.test.ts` (unit): positions keep a layer's centre on its panel, so none is ever fully off; the warning shows under 30% on the panel, and goes when moved back | Proven |
| Handles never in published output | `export-chrome.test.ts` (pixel) | Proven |

## R06 Undo and redo

| Statement | Evidence | Status |
| --- | --- | --- |
| A drag is one command | `transform-fields.spec` (UI) | Proven |
| A stroke is one command | `editor-history.test.ts` (store) | Proven |
| At least 50 commands undoable | `editor-history.test.ts` (store) | Proven |
| Redo works, cleared by a new edit | `requirements-proof` redo button (UI), `editor-history.test.ts` (store) | Proven |
| Colour, text, transforms, add, delete, order covered | `editor-controls` (UI): undo and redo of add, colour, position, word edit, order and delete, each checked in the saved design; transforms and pattern in `transform-fields`, `requirements-proof` | Proven |
| Undo never affects publication state | `requirements-proof` (UI): undo and redo reach the saved head while the public payload stays identical | Proven |
| Reload opens the last saved revision; stack not persisted | `journey.spec` (UI), `canonical-commands.test.ts` | Proven |

## R07 Synchronized rendering

| Statement | Evidence | Status |
| --- | --- | --- |
| Preview uses the same document as 2D | `render-proof.spec` (UI, 3D pixels): ink drawn on the Front and Back panels appears on that side of the tee, in its colour. Shape on the tee is the open aspect-ratio gap | Proven |
| Reports loading or stale until the latest revision is rendered | `atlas-status.spec` (UI): a delayed image shows the note until it arrives, a failed one says so, and publishing waits; `atlas-status.test.ts` (unit): each state, and a build for an older revision never counts as current | Proven |
| Delayed older decode can't overwrite a newer preview | `layer-images.test.ts` (unit, `loadLayerImages`): an older decode finishing last is dropped (failed with the guard removed). That the hook cancels on change is React's effect cleanup, read rather than tested | Proven |
| Landmark and orientation fixtures on four panels | `template-manifest.test.ts`, `panel-orientation.test.ts` | Proven |
| Transparency and transform fixtures | `render-proof.test.ts` (pixel): image alpha blends and multiplies with layer opacity; move, scale and turn on all four panels | Proven |
| WebGL failure leaves editing and 2D save available | `failures.spec` (UI): with no WebGL and with a lost context, a stroke is drawn and reaches the cloud | Proven |
| Missing 3D preview clearly labelled | `failures.spec` (UI): "3D preview unavailable" and "3D preview paused" show, the second clears on restore, and publishing says why it's blocked | Proven |

## R08 Saving and recovery

| Statement | Evidence | Status |
| --- | --- | --- |
| Autosave after 2 s, coalesced | `save-controller.test.ts` (store, fake timers) | Proven |
| Explicit Save flushes immediately | `failures.spec` (UI): clicking "Save now" sends the save ahead of the two-second wait (failed with the flush removed); `save-controller.test.ts` | Proven |
| "Saved to cloud" only after acknowledgement for that revision | `failures.spec` (UI), `save-controller.test.ts` | Proven |
| Failed or paused saves never show Saved | `failures.spec` (UI) | Proven |
| A retry creates at most one revision | `flp-api.integration` (API), `failures.spec` same key (UI) | Proven |
| Reopening gets the latest acknowledged revision | `flp-api.integration` (API), `journey.spec` reload (UI), `requirements-proof` second browser (UI) | Proven |
| Uploads finish before a revision commits | `assets.integration` (API), `save-controller.test.ts` (store) | Proven |
| Offline edits labelled local | `failures.spec` (UI); server-stopped run by hand on 2 Nov | Proven |
| Local edits recover after reload | `failures.spec` (UI): edit offline, reload, reconnect, the copy is offered and reaches the cloud (failed with the local copy removed). The page itself can't load while offline. An instant reload can still lose the last edit (CHANGELOG known limit); a reload with no gap after a stroke is offered back too (failed without the copy written as the page goes away) | Proven |
| No overwrite of newer cloud work without resolution | `failures.spec` (UI): offline, a newer save elsewhere, reconnect: "Changed elsewhere", the newer work stays, and the offline work reaches a copy (failed when the server ignored the base version); online two-tab conflict (UI, API) | Proven |

## R09 Version history

| Statement | Evidence | Status |
| --- | --- | --- |
| Timestamped revisions and named checkpoints | `history.integration` (API), `journey.spec` (UI) | Proven |
| Restore A creates C equal to A, referencing A; A and B intact | `history.integration` (API), `flp_core_schema.test.sql` (DB) | Proven |
| Named and published revisions retained | `flp_quotas.test.sql` (DB): 100 named checkpoints keep their names through a further 105 autosaves (failed when pruning included checkpoints); published version | Proven |
| 20 designs per account, clear error | `limits.spec` (UI): the 21st shows the message in My Studio; `quotas.integration` (API) | Proven |
| 100 named checkpoints, clear error | `limits.spec` (UI): the 101st shows the message in History; `flp_quotas.test.sql` (DB) | Proven |
| 100 recent autosaves | `flp_quotas.test.sql` (DB) | Proven |
| Content never silently evicted | Older autosaves are pruned, and History says so; `requirements-proof` checks the note (UI) (decision 5) | Decided (2 Nov) |

## R10 Publish and anonymous view

| Statement | Evidence | Status |
| --- | --- | --- |
| Private by default, cloud designs | `flp-api.integration` (API) | Proven |
| Private when a legacy field is absent | Cloud column is required. The legacy look store treats missing as public; out of scope for the owned flow (decision 6) | Decided (2 Nov) |
| Publish uses a specific immutable version | `publication-races.integration` (API), `flp_core_schema.test.sql` (DB) | Proven |
| Ready renders required | `publication.integration` (API) | Proven |
| Served bytes match the recorded hash | `publication.integration` replaced view (API) | Proven |
| Manifest matches the version's content hash and renderer and template versions | Hashes cover image bytes only; stays deferred under #179 | Decided (2 Nov) |
| Page shows title, optional name, preview images | `journey.spec` (UI), `publication.integration` (API) | Proven |
| Derived 3D atlas | Not enabled; `view=atlas` returns 404 (API) | Proven |
| No email, full design JSON, draft history or sign-in | `journey.spec` (UI), `publication-races.integration` (API) | Proven |
| No source uploads | `assets.integration` (API, real upload published): payload and share page hold no asset id, path or owner, served images aren't the upload, other view names give 404, and a visitor can't reach the file directly. Not broken on purpose | Proven |
| Draft edits don't change the page until republish | `publication.integration`, `design-details.integration` (API) | Proven |
| A second browser verifies the same source version | `journey.spec` (UI): the signed-out browser's `seq` equals the saved head and the owner's "Published v…" | Proven |

## R11 Unpublish and deletion

| Statement | Evidence | Status |
| --- | --- | --- |
| Denies new HTML, API and media at once | `journey.spec` (UI), `publication.integration`, `publication-races.integration` (API) | Proven |
| Denies old rendition IDs | `publication.integration` (API): every view at v1 gives 404 after a republish, and all views at every version after unpublish (failed when the version check was removed); `hosted-check.mjs` passed on staging | Proven |
| Denies crawler endpoints | `publication-races.integration` (API), `og-card.test.ts` | Proven |
| No-store on data and media | `publication.integration` (API): payload, images and share page, live and denied, including the JSON 404 (failed when the 404 lost it); `journey.spec` | Proven |
| No-store holds through the CDN | `hosted-check.mjs` `public-no-store` passed on staging (`hosted-2026-11-03.md`) | Proven |
| Open pages and downloads disclosed | `requirements-proof` (UI): the privacy page and publish review say so (failed with the wrong wording). The privacy page said three pictures and didn't mention open pages; both fixed | Proven |
| Failed unpublish shows an error | `requirements-proof` (UI): with an injected 500, "Still published" and the error show, the page stays public, and a retry works (failed with the message removed) | Proven |
| Deleted and nonpublic links give the same neutral page | `publication.integration` (API): payload, image and share page bodies compared for unpublished, deleted, private and unknown links, slug masked (failed when a known link differed); `journey.spec` compares the visible page. The share page answers 200 in all four | Proven |

## R13 Scope honesty and accessibility

| Statement | Evidence | Status |
| --- | --- | --- |
| Concept, sample, ranking and media labels | `claims.spec` (UI): no sample creators or uncleared stills, no ranking stage, and concepts carry their label. Q2 in `docs/claims-audit.md` and #199's acceptance stay with the owner | Proven, Owner |
| No fit, fabric, manufacturing or traction claims | `claims.spec` (UI): the wording is scanned on every public page and studio step, and it failed when a removed claim came back. A word list can't judge meaning, so `docs/claims-audit.md` still matters | Proven |
| Login by keyboard | `requirements-proof` (UI) | Proven |
| Save, history and sharing by keyboard | `accessibility.spec` (UI): by Tab and Enter alone, create, edit and autosave, name a checkpoint, restore, publish, copy the link (clipboard checked) and unpublish. **Save now** appears only after a failed save and isn't included | Proven |
| Labelled controls | `accessibility.spec` (UI): axe finds no serious or critical issue on the code step, a refused code, history naming, refusal and restore, publish review and the published state | Proven |
| Layers in an accessible list | `requirements-proof` uses it by role (UI), `layer-list.test.ts` | Proven |
| Numeric inputs replace dragging | `transform-fields.spec` (UI) | Proven |
| Focus stays visible | `accessibility.spec` (UI): Tab visits every control on sign-in, code step, My Studio, editor and publish review at 1280×800, each with an outline and not covered (failed with the outline removed). The global rule wins over the sign-in fields' `focus:outline-none` | Proven |
| Destructive actions name the design | Delete by hand (see R02). Restore names the version; Clear names the panel. Unpublish has no confirmation (decision 9) | Decided (2 Nov) |

## R14 Basic drawing and erasing

| Statement | Evidence | Status |
| --- | --- | --- |
| Brush with mouse or pointer | `panel-clear.spec`, `requirements-proof` (UI) | Proven |
| Selectable colour, width, opacity | `editor-controls` (UI): each reaches the saved stroke, and the panel shows the colour, more coverage when wider and a lighter mark when fainter. Saved values are close to the control's, not exact (0.06 saved 0.064, 0.5 saved 0.502) | Proven |
| Stroke belongs to one layer and panel | `requirements-proof` all four panels (UI) | Proven |
| Clipped to its panel | `render-proof.test.ts` (pixel): a wide stroke around every edge of all four panels leaves no ink outside | Proven |
| Updates the 3D view | `render-proof.spec` (UI, 3D pixels): no ink, then ink in the chosen colour on the tee straight after drawing, with no reload | Proven |
| Eraser affects only the selected layer, keeps text and graphics | `erase-isolation.test.ts` (pixel), `requirements-proof` (UI) | Proven |
| Eraser can be undone | `requirements-proof` (UI) | Proven |
| Pointer-up is one undoable stroke | `editor-history.test.ts` (store) | Proven |
| Switching panel or tool keeps the stroke | `requirements-proof` four panels and tool switch (UI, data) | Proven |
| Save, restore and publication keep appearance | `render-proof.spec` (UI, real captures): published, changed, restored and republished, the front pictures differ on under 1% of pixels | Proven |
| Clear requires confirmation | `panel-clear.spec` (UI); per panel, not per layer | Proven |

## R15 Four-sided editing

| Statement | Evidence | Status |
| --- | --- | --- |
| Distinct marks on each panel appear only on their region | `panel-isolation.integration`, `publish-parity.test.ts` (pixel, paint only); labels in the matrix, by eye | Proven |
| Panel switching and save preserve all four | `requirements-proof` (UI, data) | Proven |
| Transformations preserve all four | `render-proof.test.ts` (pixel): a transform on any panel leaves the other three pixel-identical and survives save and reload | Proven |
| Restoration preserves all four | `panel-isolation.integration` (API) | Proven |
| Wearer-side mapping explicit | `panel-orientation.test.ts`, `template-manifest.test.ts` | Proven |
| Side views imply no extra print surface | `sleeve-view-regions.test.ts` (pixel) | Proven |

## R16 Garment visual quality

Owner review approved on 1 Nov (comment on #166), from `e2e/visual-matrix.spec.ts` on 4631c16 plus #271. The matrix is opt-in, not in CI, and its screenshots aren't stored in the repo.

| Statement | Evidence | Status |
| --- | --- | --- |
| Readable silhouette at front, back, three-quarter | Owner review, #166 | Checked by hand |
| Readable from the side | Thin from exactly side-on; accepted limit (decision 10) | Decided (2 Nov) |
| No detached pieces, holes, inverted normals | `tee-mesh-integrity.test.ts` (unit): every piece is one sound mesh, open only at its counted openings, with no flipped or broken faces, and the sleeves and collar touch the body; `panel-orientation.test.ts` | Proven |
| Credible proportions, fabric surface, neutral lighting | Owner review | Checked by hand |
| Artwork legible, no stretching, mirroring, bleed | Mirroring and bleed proven (pixel); legibility by owner | Checked by hand |
| Editor and published framing consistent | `capture-framing.test.ts` (pixel); `render-proof.spec` (UI): the cloth's median colour in the published front picture is within 24 of 255 per channel of the editor's. A colour comparison, not a direct check of material settings | Proven |
| Acceptance set, every preset at 1366×768, public at 390 | Matrix run on 1 Nov, stills only; repeat on the final candidate | Checked by hand |
| CTO reviews mapping; owner reviews against mockups | Owner approval recorded; no separate CTO record or mockup comparison | Owner |

## R17 Starter patterns

| Statement | Evidence | Status |
| --- | --- | --- |
| Choose Solid, Stripes or Check | `requirements-proof` (UI, data) | Proven |
| Select two pattern colours | Ground plus brush colour (decision 8) | Decided (2 Nov) |
| Deterministic fixed scale | `render-parity.test.ts` (pixel) | Proven |
| Applied to four regions, beneath artwork | `canonical-commands.test.ts`, `editor-canonical.test.ts` | Proven |
| Changing pattern preserves artwork | `requirements-proof` (UI, data) | Proven |
| Back to Solid restores the base, keeps artwork | `requirements-proof` (UI, data) | Proven |
| Save, reload, undo, redo reproduce it | `requirements-proof` (UI, data), `render-parity.test.ts` (pixel). **Found and fixed here:** the picker showed the wrong pattern after reload or undo | Proven |
| Version restore and publication reproduce it | `render-proof.spec` (UI, real captures): a check pattern restored from History and republished matches the first publish | Proven |
| Approved presets with stable IDs | `render-proof.test.ts` (unit): the three kinds and the ids that select them are pinned | Proven |

## Section 9 Performance and limits

| Statement | Evidence | Status |
| --- | --- | --- |
| Save acknowledgement p95 ≤ 2 s | `measure.spec` on staging, 4 Nov, two runs: 0.88 s and 0.58 s (`docs/baseline.md`). It now fails above the target. Measured from one laptop, not a set of real users | Proven |
| First public image ≤ 3 s | `measure.spec` on staging, Fast 3G, 4 Nov, two runs: 1.70 to 1.78 s at both sizes (`docs/baseline.md`). It missed at 3.09 and 3.72 s until the functions moved next to the database | Proven |
| 50 layers | Stays 40 per panel, 160 in total (decision 1) | Decided (2 Nov) |
| 32 characters per object | Stays 280 (decision 1) | Decided (2 Nov) |
| 2,000 stroke points in total | Stays 4,096 per stroke, no total (decision 1) | Decided (2 Nov) |
| 512 KB canonical JSON | Stays 2 MB, server side only (decision 1) | Decided (2 Nov) |
| 100 MB per account | `limits.spec` (UI): a real upload past the limit shows the message and adds nothing; `flp_quotas.test.sql` (DB) | Proven |
| 10 MB per upload | `limits.spec` (UI): exactly 10 MB accepted, one byte more refused; `assets.integration` (API): the bucket refuses it too | Proven |
| Rejections visible; same limits on client and server | `limits.spec` (UI); `assets.integration` (API): client, signed upload and bucket share 10 MB. Pixel size is checked only on the server, and its reason is shown | Proven |

## Section 10 Sharing and privacy

| Statement | Evidence | Status |
| --- | --- | --- |
| Public pages carry `noindex` | `og-card.test.ts` (unit) for the tag; the page and image routes send `X-Robots-Tag` | Proven |
| Only a chosen name is shown; none invented | `publication.integration` (API), `og-card.test.ts` (unit) | Proven |
| Name is per account, capped, clearable on the profile | `design-details.integration` (API), `flp_design_details.test.sql` (DB) | Proven |
| Clearing the name removes it from live pages | `design-details.integration` (API), through `flp_set_display_name` | Proven |
| Email stays private | `journey.spec` (UI) | Proven |
| Report-contact route | `claims.spec` (UI): the shared page's link is a mailto with the design's slug; `alpha-contact.test.ts` (unit); the address is live on staging (4 Nov) | Proven |
| Operator takedown | Manual steps in `docs/deploy.md`; an owner may be able to republish afterwards (decision 7) | Decided (2 Nov) |
| Operator deletion finishes, is retryable | `delete-account.integration` (API, real script), `flp_account_deletion.test.sql` (DB) | Proven |
| Deleted account's token and public link stop working; uploads deleted | `delete-account.integration` (API, real script, a real upload): all work before, then 401, no rows, a 404 identical to an unknown link, and the upload and render URLs fail | Proven |
| Seven-day and thirty-day windows | No test; operational | Owner |
| Plain-language privacy page | `claims.spec` (UI): each section's key statements and a working contact link; `requirements-proof` for disclosure. Whether the wording is plain enough stays a reader's call | Proven |

## Decisions the owner made

All ten are recorded in `docs/decisions.md` (2 Nov 2026), and the "decision N" notes above use its numbering.
