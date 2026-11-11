# Release record: 0.9.0-rc.7

| | |
| --- | --- |
| Version | `0.9.0-rc.7` (package.json) |
| Tag | `v0.9.0-rc.7` |
| Commit | `a8e2a3d75f1e2d4dc2f8dfc2e3eaf944af8a5254` |
| Subject | Merge pull request #355 from stanjhae/flp/rc7 (2026-11-11) |
| Template | `tee-crew-short@3` (src/lib/template-manifest.ts) |
| Canonical schema | v2 (src/lib/canonical-document.ts) |
| Recorded | 2026-11-11T11:21:09.159Z |

## Migrations

12 files in `supabase/migrations/`, in apply order. Compare with `supabase migration list --linked`.

| Migration | SHA-256 |
| --- | --- |
| `20261030120000_flp_core_schema.sql` | `587626cb570b8627622ed78505509d7cac6bbdc98056e1bf23c867b6a4765953` |
| `20261031090000_flp_isolation.sql` | `6ebebfe9434803572ec603778928692c786861e3a8a2e821dd40c5660a0c1b1b` |
| `20261101090000_flp_asset_lifecycle.sql` | `caffe51e3dea64049eb755a3b23781857e246e7601c9a27d3f022505d659d81b` |
| `20261102090000_flp_cascade_deletes.sql` | `985c9ac496e5306545f9bab509ed76548fe84cafb2b9e6847d704e22b2c407d4` |
| `20261103090000_flp_design_details.sql` | `6cde7709526ecfc0936061d84e6beea5e6eef52e92b68c460a5a7d275143f053` |
| `20261104090000_flp_quotas.sql` | `bad7407d0f6e3802f73da21ba18d66ee8bc361666c4e5fb630dff04a680f7b2c` |
| `20261105090000_flp_publication_title.sql` | `9c2c4dee06a5312dc34a4486ca5d9971a01e2394e91289210807c00a8c551de5` |
| `20261106090000_flp_clear_public_name.sql` | `5dfbc7a6f03911407aefe17c3e49a2936f1352bba3bac5a1b42ca8948e9c776e` |
| `20261110090000_flp_render_build_stamp.sql` | `3586e606a85348dcacc51899d428d4010e0c0044d1c925efe74fc3fd467052d3` |
| `20261111090000_flp_publication_votes.sql` | `b9cc3b64ce338bf201e58b9db34337cacf739a2404eb2b23e8b9f3170f838d5b` |
| `20261114090000_flp_terms_acceptance.sql` | `cd77ee3394c9cbf70b42fdf9be2c236fd0a47628f383e37512d68cc2de8a0a24` |
| `20261116090000_flp_abuse_moderation.sql` | `da7f6a72c78a30a4456aa43f1059a8e0f5e9de38ebbaac9120ce4a7148edfdc1` |

## CI

| Workflow | Result | Started | Run |
| --- | --- | --- | --- |
| Synthetic check | success | 2026-11-11T11:13:57Z | https://github.com/stanjhae/3d-playground/actions/runs/43010221248 |
| CI | success | 2026-11-11T11:05:20Z | https://github.com/stanjhae/3d-playground/actions/runs/43009012034 |

## Suites

| Suite | Result |
| --- | --- |
| pnpm test | 1171 passed, 136 skipped |
| supabase test db | PASS (173) |
| pnpm test:integration | 139 passed |
| pnpm e2e | 119 passed, 2 failed, 3 skipped (budgets.spec needs the production build: passes there; locks.spec timed out under load, passes alone 3/3 and in CI) |
| measure | save ack p95 65 ms; first public image 1.43 s (390) / 1.42 s (1366) on Fast 3G |
| demo | reset twice same state; fallback video 49 s plays end to end |
| `pnpm hosted:check` | PASS (with skips) ([docs/evidence/hosted-2026-11-11.md](../../docs/evidence/hosted-2026-11-11.md)) |

## Known limits

From CHANGELOG.md, 0.9.0-rc.7: alpha release candidate (11 Nov 2026):

- **The browser journey was not run on staging for this candidate.** The hosted check passed its other 15 checks, including terms, votes, takedowns and account deletion (`docs/evidence/hosted-2026-11-11.md`), but the run can't read sign-in codes.
- **Real iPad and Pencil** haven't been tried with this candidate: pressure, palm handling and frame times were proven with simulated events only.
- **Error tracking is off** until `SENTRY_DSN` is set in Vercel (`docs/alerts.md`).
- **The terms wording** is a plain-language draft awaiting the owner's review.
- **Drawing after placing a word or image adds a paint layer,** so the 40-layer panel limit arrives sooner.
- **Marks near a side seam read narrower,** and brush dabs and base patterns draw in atlas proportions, as on rc.6.
- **After sign-out,** a direct database read with the old access token can still work until it expires, at most an hour (`docs/decisions.md`, 3 Nov).
- **The first request after a sign-in can fail on the local stack** ("JWT issued at future", PGRST303), as on rc.6.
- **WebKit stands in for recent Safari.** Real iPhone Safari and Android aren't tested.
- **Owner items:** rights (#138), brand and product decisions (#198), the claims questions (#199), branch protection (#192), the operator for alerts (#193), and validation and pitch work (#196, #197, #200, #201).
