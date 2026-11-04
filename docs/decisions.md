# Product and delivery decisions (V03 #198)

Decisions that change scope or behaviour for the 17 November alpha, with the reason and who decided. Newest first. Each one links the issues it affects; an issue that a decision defers stays open, with a comment pointing here.

## 4 Nov 2026: the preview says when it isn't the whole design (#164)

**Decided by:** owner, reversing the 31 Oct deferral of #164 and decision 4 of 2 Nov.

The preview now shows when artwork is loading or couldn't load, and publishing waits for it. An image that can't load blocks publishing; a font that misses its load shows a note, and the word publishes in a stand-in, as it did before. This is a targeted change, not the pipeline rewrite that was deferred: atlas builds were already synchronous and pure. The template and compiler revision on stored renders (the #179 part) stays deferred, because it needs a migration.

## 4 Nov 2026: images keep their shape, on a new template version

**Decided by:** owner, on the requirements audit.

A placed image now keeps its shape on the 2D panel and on the tee, in both places. The panels changed shape to match the cloth: front and back about 3:5, sleeves about 3:1. This ships as template `@3`, so existing designs keep the look and panels they were made with (`docs/template-manifest.md`). Brush dots and base patterns stay in atlas proportions.

## 3 Nov 2026: staging is hosted, without SMTP for now

**Decided by:** owner (#186).

Staging runs on the current Vercel deployment (its Production environment) with its own Supabase project, kept separate from any future production project rather than using branches. This replaces "local Supabase until a hosted project exists" for staging. The 17 Nov demo still runs locally. The guest studio is gone from that deployment. Custom SMTP is left out for now, so `email-code-config` fails and sign-in on staging, the browser suite and the real-inbox sign-in stay unproven.

## 3 Nov 2026: a signed-out access token expires rather than stopping at once

**Decided by:** owner (#284).

Sign-out refuses the refresh token, and the API refuses the old access token straight away. Direct Supabase REST checks only the JWT, so until that token expires (at most an hour) it can still read its owner's rows, and can't write. Its owner's files follow the same read policy. This stays as a known limit for the alpha. Closing it would need a migration to check the session on every read, which isn't worth the risk this close to the freeze.

## 2 Nov 2026: the requirements audit's ten decisions

**Decided by:** owner, on the rc.2 audit (`docs/evidence/requirements-rc.md`). PRD section 13 asks for a recorded decision to change Must scope; these are those records.

| # | Requirement | Statement | Decision |
| --- | --- | --- | --- |
| 1 | Section 9, R04 | 50 layers, 32 characters, 2,000 stroke points, 512 KB JSON | **Keep the current numbers:** 40 layers per panel (160 in total), 280 characters, 4,096 points per stroke, 2 MB JSON. Tightening could make existing designs read as over the limit. |
| 2 | R03 | Left, right and reset camera controls | **Left and right added** to the preview's camera bar. **No separate reset:** picking a preset is the nearest thing. |
| 3 | R05 | Warning for a fully off-panel object | ~~Deferred.~~ **Built on 4 Nov.** A layer's centre always stays on its panel, so none is ever fully off. The warning shows when under 30% of it is on the panel, and the layer stays in the list. |
| 4 | R07 | Reports loading or stale until the latest revision renders | ~~Waived with #164.~~ **Built on 4 Nov**, see above. |
| 5 | R09 | Content never silently evicted | **Pruning stays, and History says so.** The 100 latest autosaves are kept, plus every checkpoint, restore and published version. |
| 6 | R10 | Private when a legacy field is absent | **Out of scope for the owned flow.** Cloud designs always have a visibility. The legacy look store is the closed guest surface (see 1 Nov). |
| 7 | Section 10 | Operator takedown | **The manual step is accepted** for a controlled alpha (`docs/deploy.md`). An owner may be able to republish afterwards. |
| 8 | R17 | Select two pattern colours | **Ground plus brush colour is accepted.** There's no second picker. |
| 9 | R13 | Destructive actions name the design | **Unpublish has no confirmation,** because republishing restores the same link. |
| 10 | R16 | Readable from the side | **The thin side-on view is the accepted limit,** from the owner review on #166. |

Also on 2 Nov: render manifest versions stay deferred under the 31 Oct entry for #179.

The owner also chose to fix the cleared public name with a migration rather than change what the studio says: clearing the name now takes it off every live publication. A new name still waits for the next publish, as the pinned title does (#150).

## 1 Nov 2026: the legacy no-auth and no-Postgres rules are superseded for the alpha

**Decided by:** owner, in PRD v1.1 (F09 #144); recorded here so the tracking issues no longer read as current.

The legacy tracking epics #96 and #108 list "Guest author" and "No auth, Postgres" among their constraints, and the guest board they built (#19, #20, #90, #91) took anonymous looks and votes. For the alpha these rules are **superseded**: accounts are required (Supabase Auth), alpha work lives in Postgres behind row-level security, and creating, saving and publishing happen only through the signed-in FLP API. The guest board stays only as a closed, read-only legacy surface: wherever Supabase is configured and sign-in is not switched off, `/api/designs` refuses anonymous looks and votes with 403 on the server and lists no alpha work (`guestBoardClosed` in `src/lib/designs-handlers.ts`; `designs-handlers.integration.test.ts`). The guest-only studio without Supabase is unchanged. The hosted check is on #186.

## 1 Nov 2026: demo polish pulled forward before the freeze

**Decided by:** owner ("demo polish" for the time left before 12 Nov).

Three items deferred on 31 Oct were delivered for the alpha instead, each through its own PR and the rc.2 combine check:

- **#179 sleeve views:** publishing captures five views, and three-view publications stay public (#263).
- **#156 numeric transforms:** X, Y, size and turn fields with drag/number/keyboard parity (#262).
- **#141 legacy import:** a before/after preview, plus uploads of the landing design's images (#261).

The 3D views also render on demand (`frameloop="demand"`, #264). An idle studio draws nothing. This removed the two-tab CI flake and shortens the e2e suite.

**Still deferred:** #164 (the revision-tagged atlas rewrite) and the template/compiler revision on renders (part of #179).

## 31 Oct 2026: defer three large renderer and editor items past the freeze

**Decided by:** owner, when planning the pre-freeze wave.
**Freeze:** 12 Nov 2026.

| Issue | What | Why it waits | Alpha behaviour instead |
| --- | --- | --- | --- |
| #164 R01 | Revision-tagged deterministic atlas composition | A rewrite of the render pipeline. The current v1 projection (`render-projection.ts`) is covered by parity tests and the e2e journey, and replacing it this close to the freeze risks the primary journey. | The projection stays. Known parity gaps are fixed one at a time (#158 opacity, #161 stripe period, #165 collar). |
| #179 P01 (part) | Template/compiler revision on renders | A render pipeline change (see #164). | Sleeve views shipped on 1 Nov: publishing captures five views (front, three-quarter, back, wearer's right, wearer's left). Versions published with three views stay public. The public page says it's a creator-supplied preview. |
| #156 E05 (part) | Numeric transform inputs (x, y, scale, rotation) | A new editing surface plus parity tests. | Delivered on 1 Nov instead (#262); see above. |

## 31 Oct 2026: public media are never cached

**Decided by:** owner (#183).

Public images, the public payload and the share/OG page are sent with `Cache-Control: no-store`, so unpublishing or deleting a design takes effect immediately for every viewer and CDN. The cost is a little more load per view, which is acceptable for the alpha. Images someone already saved can't be recalled; `/privacy` says so.

## 30 Oct 2026: tracker reconciliation and hosted verification

**Decided by:** owner.

Issues whose acceptance criteria are met on local Supabase are closed with evidence comments. Their remaining "passes against the deployed backend" check moves to one checklist on #186, to be worked through when staging exists (`docs/deploy.md`, `pnpm e2e` with `E2E_BASE_URL`).

## Earlier decisions (recorded during delivery)

- **Local Supabase until a hosted project exists.** Replaced for staging on 3 Nov, above (#186).
- **Sign-in is required** for `/create` and `/studio` wherever Supabase is configured. The legacy guest board is closed on the server too (#144, #249).
- **Non-tee concept features** (gown, slip, coat, suit, fabrics, pattern stamps, art) sit behind `VITE_FLP_CONCEPT`, off by default.
- **Published title is pinned** to the publication. A rename shows publicly only after publishing again (#150).
- **Quotas:** 20 designs, 100 named checkpoints and the 100 most recent autosaves per design, 100 MB of uploads; per-account rate limits (#178, #187). See `docs/data-model.md`.
