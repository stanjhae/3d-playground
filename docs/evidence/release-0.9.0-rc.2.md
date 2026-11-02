# Release record: 0.9.0-rc.2

| | |
| --- | --- |
| Version | `0.9.0-rc.2` (package.json) |
| Tag | `v0.9.0-rc.2` |
| Commit | `1193fcc82f11f9e39467d01376c7e04d76623b00` |
| Subject | Merge pull request #275 from stanjhae/flp/hosted-readiness-kit (2026-11-02) |
| Template | `tee-crew-short@2` (src/lib/template-manifest.ts) |
| Canonical schema | v2 (src/lib/canonical-document.ts) |
| Recorded | 2026-11-02T05:57:37.940Z |

## Migrations

7 files in `supabase/migrations/`, in apply order. Compare with `supabase migration list --linked`.

| Migration | SHA-256 |
| --- | --- |
| `20261030120000_flp_core_schema.sql` | `587626cb570b8627622ed78505509d7cac6bbdc98056e1bf23c867b6a4765953` |
| `20261031090000_flp_isolation.sql` | `6ebebfe9434803572ec603778928692c786861e3a8a2e821dd40c5660a0c1b1b` |
| `20261101090000_flp_asset_lifecycle.sql` | `caffe51e3dea64049eb755a3b23781857e246e7601c9a27d3f022505d659d81b` |
| `20261102090000_flp_cascade_deletes.sql` | `985c9ac496e5306545f9bab509ed76548fe84cafb2b9e6847d704e22b2c407d4` |
| `20261103090000_flp_design_details.sql` | `6cde7709526ecfc0936061d84e6beea5e6eef52e92b68c460a5a7d275143f053` |
| `20261104090000_flp_quotas.sql` | `bad7407d0f6e3802f73da21ba18d66ee8bc361666c4e5fb630dff04a680f7b2c` |
| `20261105090000_flp_publication_title.sql` | `9c2c4dee06a5312dc34a4486ca5d9971a01e2394e91289210807c00a8c551de5` |

## CI

| Workflow | Result | Started | Run |
| --- | --- | --- | --- |
| CI | success | 2026-11-02T05:39:32Z | https://github.com/stanjhae/3d-playground/actions/runs/41395299899 |

## Suites

| Suite | Result |
| --- | --- |
| pnpm test | 773 passed |
| supabase test db | PASS |
| pnpm test:integration | 101 passed |
| pnpm e2e | 26 passed, 3 on-request skipped; publish review 0/5 failed |

## Known limits

From CHANGELOG.md, 0.9.0-rc.2: alpha release candidate (1 Nov 2026):

- Not hosted yet: staging and production need a hosted Supabase project (#186). The hosted checks are listed on that issue.
- The tee reads very thin from exactly side-on; front, back, three-quarter and sleeve views are credible (owner review, #166).
- WebKit stands in for recent Safari. Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- Deferred past the freeze: a revision-tagged atlas (#164).
- The "not available" page's title repeats the site name ("Fashion Leader Vote — Fashion Leader Vote"); cosmetic.
- Owner items: rights (#138), the contact email (#195), branch protection (#192), the operator for alerts (#193), the claims-audit questions (#199), and validation and pitch work (#196–#201).
