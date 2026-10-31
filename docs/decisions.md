# Product and delivery decisions (V03 #198)

Decisions that change scope or behaviour for the 17 November alpha, with the reason and who decided. Newest first. Each one links the issues it affects; an issue that a decision defers stays open, with a comment pointing here.

## 31 Oct 2026: defer three large renderer and editor items past the freeze

**Decided by:** owner, when planning the pre-freeze wave.
**Freeze:** 12 Nov 2026.

| Issue | What | Why it waits | Alpha behaviour instead |
| --- | --- | --- | --- |
| #164 R01 | Revision-tagged deterministic atlas composition | A rewrite of the render pipeline. The current v1 projection (`render-projection.ts`) is covered by parity tests and the e2e journey, and replacing it this close to the freeze risks the primary journey. | The projection stays. Known parity gaps are fixed one at a time (#158 opacity, #161 stripe period, #165 collar). |
| #179 P01 (part) | Sleeve and four-view public renders; template/compiler revision on renders | Needs new camera presets, capture time (already slow on software WebGL in CI) and a manifest change. | Publishing captures three views: front, three-quarter and back. Sleeve prints show in the three-quarter view. The public page says it's a creator-supplied preview. |
| #156 E05 (part) | Numeric transform inputs (x, y, scale, rotation) | A new editing surface plus parity tests. Keyboard nudges (#248) cover the accessibility need. | Drag handles plus arrow-key nudges (Shift for larger steps), each one undo step. |

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
