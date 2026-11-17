# Releases and the feature freeze (Q07 #192)

How the alpha is versioned, what may change after the freeze, and the checks every release candidate passes before it is tagged.

## Versions

- `0.9.0-rc.N`: release candidates for the alpha. The version is in `package.json`, and each candidate gets a git tag `v0.9.0-rc.N`.
- `0.9.0`: the alpha. It is the last green candidate that meets every quality bar below, retagged with no code changes.
- `CHANGELOG.md` gets one entry per candidate, grouped by area, with the PRs that delivered each change.

## The alpha ships on quality, not a date

There is no fixed date (`docs/decisions.md`, 11 Nov). The alpha is `0.9.0` once a candidate meets every bar here, each proven with a record in `docs/evidence/`.

| Area | Bar | How it's proven |
| --- | --- | --- |
| Paint feel | Stroke frame p95 ≤ 16.7 ms on a laptop and on a real iPad | The `docs/baseline.md` method, plus an iPad pass |
| Interaction | INP ≤ 200 ms on the studio and the share page | Web Vitals on beta |
| Public page | First image ≤ 3 s on Fast 3G, on staging | The `measure` spec against beta |
| Beginners | At least 80% complete all 8 tasks unaided; SUS ≥ 80 | The usability sessions (#196, #197, `docs/usability-test.md`) |
| Accessibility | WCAG 2.2 AA; every studio action reachable without a pointer | The axe e2e checks and a manual pass |
| Reliability | No lost work in the fault tests; the staging journey passes with real sign-in | e2e, and the hosted check with no skips |
| Devices | Real iPhone Safari, iPad with Pencil, and one Android phone | A manual pass, recorded |

## Freeze

The freeze starts when the planned feature list is done, not on a date. It is announced in `docs/decisions.md` and tagged as a candidate. Changes to stored data (migrations, a new document format, or a change to the pixels the atlas draws) land before it, so they have the longest time in use.

From the freeze until the alpha:
- **Only fixes for critical or high defects**, meaning anything that loses or leaks data, shows the wrong version publicly, or breaks the demo journey. No new features, no refactors, no dependency upgrades.
- Each fix is its own PR, links its issue, and adds a test that would have caught it. CI must be green, browser tests included.
- After any merge, cut a new candidate (`rc.N+1`) and rerun the checklist below.
- Anything else goes in an issue labelled for after the alpha. The decisions log (`docs/decisions.md`) records anything deferred.

## Release checklist

Run it on the exact commit to be tagged, in the main checkout.

**Build and tests**
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm lint` and `pnpm audit --audit-level high` are clean
- [ ] `pnpm build` (route generation, typecheck, Vite) is clean, and `node scripts/check-budgets.mjs` passes (JS and GLB budgets, also in the CI `check` job)
- [ ] `pnpm test`
- [ ] `supabase test db`: **Result: PASS**
- [ ] `pnpm test:integration`
- [ ] `E2E_PORT=5299 pnpm e2e`: everything passes (keep the machine otherwise idle; a load above about 30 makes browser runs meaningless)
- [ ] CI is green on the commit (all jobs)

**Data and migrations**
- [ ] `supabase migration list --local` matches `supabase/migrations/`, and the list is recorded in the release notes
- [ ] No migration rewrites an applied file; fixes are new forward migrations (`docs/deploy.md`)

**Measured evidence** (`docs/baseline.md`, production build via `pnpm preview`)
- [ ] `MEASURE=1 E2E_BASE_URL=http://localhost:5399 pnpm exec playwright test measure`: save acknowledgement p95 ≤ 2 s, first public image ≤ 3 s on Fast 3G at 390 and 1366 px
- [ ] The numbers are recorded in `docs/baseline.md` if they changed

**Security and privacy**
- [ ] The CSP and security headers are present on `/`, `/s/<slug>` and `/api/flp/public/<slug>` (e2e `security.spec.ts`)
- [ ] `scripts/cleanup-orphans.mjs` dry run: no unexpected leftovers
- [ ] `/privacy` is accurate for this release; `VITE_FLP_CONTACT_EMAIL` is set on the deployed environment

**Demo**
- [ ] `node scripts/demo-reset.mjs` twice gives the same state
- [ ] Walk `docs/demo.md` once by hand against `pnpm preview`
- [ ] Record the fallback video (`RECORD=1`, `e2e/demo-recording.spec.ts`) and check it plays end to end

**Tag and notes** (only once everything above is ticked)
- [ ] Bump `package.json` and `CHANGELOG.md`, merge through a PR
- [ ] `git tag -a v0.9.0-rc.N -m "…" <commit>` and `git push origin v0.9.0-rc.N`
- [ ] `node scripts/release-record.mjs --suite "pnpm test=…" --suite "pnpm e2e=…" [--hosted docs/evidence/hosted-<date>.md]` writes `docs/evidence/release-<version>.md`, covering the version, tag, commit, migration checksums, template and schema versions, CI run, suites and known limits. Commit it with the release.
- [ ] Create a GitHub release from the tag (marked pre-release), with the CHANGELOG entry, the migrations list and the measured numbers
- [ ] Update the tracker (#125) with the candidate and anything still open

## Rollback floor

Builds below the floor can't open designs that newer builds save, so never promote a deployment below it.

- **Floor: `v0.9.0-rc.7`.** It contains the reader for flips, locks and pen pressure (#326, master `cb4d4c9`) and their writers (#338, #341, #352). Designs saved from W1 on can store `flipX`, `flipY`, `pressures` and `locked`, which `v0.9.0-rc.6` and earlier refuse. **rc.6 is no longer a fallback.**
- Roll back by promoting a Vercel deployment built from rc.7 or later, or by `git revert`.
- `src/lib/optional-fields.test.ts` loads a design using every optional field; it must keep passing at the floor.
- **Pending: shape v1.** Designs shaped with the shape sliders store an optional top-level `shape` block (left out while the shape is neutral, so unshaped designs are byte-for-byte and hash-for-hash unchanged). Builds without the reader refuse a shaped design predictably: their strict validator reports `$.shape: unknown field`, cloud load shows the design as unreadable, and recovery treats it as `unsupported`. Nothing is silently dropped or overwritten. Unshaped designs still open on those builds. The reader and writer land together, so once a shaped design is saved, the floor moves to the release that carries shape v1. `src/lib/optional-fields.test.ts` loads a shaped v4 tee.
- **Pending: pattern v1.** This release reads an optional top-level `pattern` block (`docs/canonical-document.md`), and no release writes one yet. Builds without the reader refuse a design with a pattern predictably (`$.pattern: unknown field`), as they refuse a shaped one. The Pattern (beta) writer merges only after a release carrying this reader has been deployed for at least one release cycle. From the first saved pattern on, the floor is the first release that carries both the reader and the `validate-geometry` check. `src/lib/pattern/pattern-document.test.ts` loads a tee with a pattern.
- **Pattern v1 is written now.** The Pattern (beta) writer is live, so beta can't roll back below the first release containing the pattern reader (#378, master `2a97b86`). No release tag contains it yet: the next candidate cut from master becomes the floor, and `v0.9.0-rc.7` stops being a fallback once a pattern is saved.
- **Pending: pattern-reader R.** This release reads cut-outs (`holes` on a pattern piece), four more simulation fabrics (`linen`, `chiffon`, `canvas`, `wool`) and four upcoming garment templates (`vest`, `crop`, `dress`, `trousers`); nothing writes them yet (`docs/canonical-document.md`). Builds without it refuse such a design predictably (`unknown field`, or an unknown fabric or template id). The cut-out writer, the fabric-drape writer and the new-garment writers merge only after a release carrying this reader has been deployed for at least one release cycle; from the first such design saved, the floor is that release. `src/lib/optional-fields.test.ts` and `src/lib/pattern/pattern-document.test.ts` load these designs.
- **Cut-outs are written (C2).** The cut-out writer saves `holes`, which builds before pattern-reader R (#392, master `922ad18`) refuse (`unknown field`). It merges only once a deployment carrying #392 has been live for 24 h; from the first design saved with a cut-out, beta can't roll back below the first release containing #392. Designs without cut-outs are unchanged, byte for byte and hash for hash.
- **The new-garment writer (D1) is ready.** The vest, crop top, dress and trousers now have templates (`vest@1`, `crop@1`, `dress@1`, `trousers@1`), so this release saves designs on them. A build without pattern-reader R (#392, master `922ad18`) refuses such a design (`$.template.id: expected one of …`). The writer merges only once #392 has been deployed for 24 h. From the first design saved on one of them, the floor is the first release carrying #392, which the next candidate cut from master after it becomes. Builds that carry R but not D1 still open such a design's data, but they say it needs a newer version, because they have no manifest for the template.
- **Pending: pattern meshes.** Migration `20261120090000_flp_pattern_meshes` is additive: a new table, plus one more allowed type on the uploads bucket. Builds before it ignore both, so it doesn't move the floor. Push it to the database before the deployment that uses it.
- **17 Nov: the 24 h wait was waived for pattern-reader R.** The owner chose to merge the fabric-drape (#394), cut-out (#395) and new-garment (#396) writers the day #392 deployed, accepting that a rollback below #392 would show designs using them as unreadable (never lost) until beta rolls forward. The floor is now the first deployment carrying #392 (master `922ad18`).
- **Pending: reader R2.** This release reads `base.fabric`, `scaleY` on image and text layers, whole-panel `fill` layers and the tee's `@6` (`docs/canonical-document.md`); nothing writes them yet. Builds without it refuse such a design predictably (`unknown field`, an unknown layer kind, or the template version reported as unsupported), never silently dropping anything. Designs without them are unchanged, byte for byte and hash for hash. From the first design saved with any of them, the floor is the first release carrying R2. `src/lib/optional-fields.test.ts` loads a design using every one.
- **17 Nov: the 24 h wait is waived for reader R2.** The owner waived it on 17 Nov, so the fabric, stretch, section-fill and tee `@6` writers may merge right after R2 is deployed, accepting that a rollback below R2 would show designs using them as unreadable (never lost) until beta rolls forward.
- Move the floor only when a new reader lands and its writer is about to merge (reader deployed 24 h first).

## Rollback

- **Code:** redeploy the previous tag at or above the floor (Vercel → Deployments → promote), or `git revert` the offending merge and cut a new candidate.
- **Database:** forward fixes only; restore from backup if a migration damaged data (`docs/backup-restore.md`, Q09 #194).
- **Local demo:** check out the previous tag, `pnpm install --frozen-lockfile`, `pnpm build && pnpm preview`, then `node scripts/demo-reset.mjs`.
