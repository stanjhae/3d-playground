# Release record: 0.9.0-rc.4

| | |
| --- | --- |
| Version | `0.9.0-rc.4` (package.json) |
| Tag | `v0.9.0-rc.4` |
| Commit | `8da86bfb23f078408252a678ee6d4ef0d2bbc084` |
| Subject | Merge pull request #290 from stanjhae/flp/rc4 (2026-11-03) |
| Template | `tee-crew-short@2` (src/lib/template-manifest.ts) |
| Canonical schema | v2 (src/lib/canonical-document.ts) |
| Recorded | 2026-11-03T11:07:49.160Z |

## Migrations

8 files in `supabase/migrations/`, in apply order. Compare with `supabase migration list --linked`.

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

## CI

| Workflow | Result | Started | Run |
| --- | --- | --- | --- |
| CI | success | 2026-11-03T10:17:25Z | https://github.com/stanjhae/3d-playground/actions/runs/41618021071 |

## Suites

| Suite | Result |
| --- | --- |
| pnpm build | clean, bundle within budget in CI |
| pnpm test | 795 passed, 107 skipped (integration, run below) |
| supabase test db | PASS (93) |
| pnpm test:integration | 110 passed |
| pnpm e2e | 43 passed, 3 on-request skips |
| measure | passed |
| demo-recording | passed |
| `pnpm hosted:check` | FAIL ([docs/evidence/hosted-2026-11-03.md](../../docs/evidence/hosted-2026-11-03.md)) |

## Known limits

From CHANGELOG.md, 0.9.0-rc.4: alpha release candidate (3 Nov 2026):

- Staging has no custom email (SMTP) yet, so sign-in can't work there: the Free tier refuses the code email template. The browser journey and real-inbox sign-in are unproven on staging, and the demo stays local (#186, `docs/decisions.md`, 3 Nov).
- After sign-out, the refresh token stops working and the app's API refuses the session straight away, but a direct database read with the old access token can still work until that token expires, at most an hour (`docs/decisions.md`, 3 Nov).
- The audit's ten decisions keep these differences from the PRD: the input limits, no reset camera, no off-panel warning, no stale preview state, pruned autosaves, a manual takedown, two pattern colours from ground and brush, no confirmation on unpublish, and the thin side-on view (`docs/decisions.md`, 2 Nov).
- WebKit stands in for recent Safari. Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- A stroke can be lost if the page reloads immediately after it, with no recovery prompt. With a gap of 100 ms or more, the prompt appeared and the stroke was kept (found in the rc.3 checklist).
- Deferred past the freeze: a revision-tagged atlas (#164).
- Owner items: rights (#138), the contact email (#195), branch protection (#192), the operator for alerts (#193), the claims-audit questions (#199), and validation and pitch work (#196–#201).
