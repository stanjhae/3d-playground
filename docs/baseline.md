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

- `package.json` has no `packageManager` field, so the pnpm version is not pinned. Pinning under pnpm 12 also writes the pnpm binary into `pnpm-lock.yaml` and can change how Vercel installs, so it belongs to Q07 #192 (CI and release process), not this record.

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

Guest publishing (`POST /api/designs` with no account), the vote endpoint (`/api/designs/:id/vote` rewrite), `routes/vote.tsx`, the board ranking (`rank-designs.ts`, `vote-board.ts`) and challenges. These stay as historical references (#75, #96, #108) and are not alpha acceptance.

## Follow-ups

`master` has no failing checks, so F01 needs no new defect issues. The open items are already tracked:

- Bundle size → #169.
- The landing-handoff test environment → fix on `flv/landing-handoff` before it merges.
