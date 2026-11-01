# Product and delivery decisions (V03 #198)

Decisions that change scope or behaviour for the 17 November alpha, with the reason and who decided. Newest first. Each one links the issues it affects; an issue that a decision defers stays open, with a comment pointing here.

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

- **Local Supabase until a hosted project exists.** Production keeps the guest studio until then (#186).
- **Sign-in is required** for `/create` and `/studio` wherever Supabase is configured. The legacy guest board is closed on the server too (#144, #249).
- **Non-tee concept features** (gown, slip, coat, suit, fabrics, pattern stamps, art) sit behind `VITE_FLP_CONCEPT`, off by default.
- **Published title is pinned** to the publication. A rename shows publicly only after publishing again (#150).
- **Quotas:** 20 designs, 100 named checkpoints and the 100 most recent autosaves per design, 100 MB of uploads; per-account rate limits (#178, #187). See `docs/data-model.md`.
