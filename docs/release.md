# Releases and the feature freeze (Q07 #192)

How the alpha is versioned, what may change after the freeze, and the checks every release candidate passes before it is tagged.

## Versions

- `0.9.0-rc.N`: release candidates for the 17 Nov alpha. The version is in `package.json`, and each candidate gets a git tag `v0.9.0-rc.N`.
- `0.9.0`: the alpha shown on 17 Nov. It is the last green candidate, retagged with no code changes.
- `CHANGELOG.md` gets one entry per candidate, grouped by area, with the PRs that delivered each change.

## Freeze (12 Nov 2026)

From the freeze until the demo:
- **Only fixes for critical or high defects**, meaning anything that loses or leaks data, shows the wrong version publicly, or breaks the demo journey. No new features, no refactors, no dependency upgrades.
- Each fix is its own PR, links its issue, and adds a test that would have caught it. CI must be green, browser tests included.
- After any merge, cut a new candidate (`rc.N+1`) and rerun the checklist below.
- Anything else goes in an issue labelled for after the alpha. The decisions log (`docs/decisions.md`) records anything deferred.

## Release checklist

Run it on the exact commit to be tagged, in the main checkout.

**Build and tests**
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm build` (route generation, typecheck, Vite) is clean, and the bundle is within budget (the CI `check` job)
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

## Rollback

- **Code:** redeploy the previous tag (Vercel → Deployments → promote), or `git revert` the offending merge and cut a new candidate.
- **Database:** forward fixes only; restore from backup if a migration damaged data (`docs/backup-restore.md`, Q09 #194).
- **Local demo:** check out the previous tag, `pnpm install --frozen-lockfile`, `pnpm build && pnpm preview`, then `node scripts/demo-reset.mjs`.
