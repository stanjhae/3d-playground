# Release record: 0.9.0-rc.5

| | |
| --- | --- |
| Version | `0.9.0-rc.5` (package.json) |
| Tag | `v0.9.0-rc.5` |
| Commit | `5edc90caed9df9a1fbb08a8ec43496871ba20551` |
| Subject | Merge pull request #308 from stanjhae/flp/rc5 (2026-11-04) |
| Template | `tee-crew-short@3` (src/lib/template-manifest.ts) |
| Canonical schema | v2 (src/lib/canonical-document.ts) |
| Recorded | 2026-11-05T06:32:20.149Z |

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
| CI | success | 2026-11-04T19:45:12Z | https://github.com/stanjhae/3d-playground/actions/runs/41899971487 |

## Suites

| Suite | Result |
| --- | --- |
| pnpm build | clean |
| pnpm test | 875 passed, 109 skipped |
| supabase test db | PASS (93) |
| pnpm test:integration | 112 passed |
| pnpm e2e | 87 passed, 3 on-request skips |
| failures spec on the production build | 16 passed |
| visual matrix, chromium and WebKit | 56 pictures, reviewed on contact sheets |
| demo-recording, 1440×900, port 4173 | passed, 61.9 s video, frames checked, not played |
| `pnpm hosted:check` | PASS ([docs/evidence/hosted-2026-11-04.md](../../docs/evidence/hosted-2026-11-04.md)) |

## Known limits

From CHANGELOG.md, 0.9.0-rc.5: alpha release candidate (4 Nov 2026):

- **Marks near a side seam read narrower:** the torso is an oval, so shapes are true across the central half.
- **Brush dabs and base patterns draw in atlas proportions:** on a sleeve a dab looks about 1.7:1 tall, and a check's cells aren't square.
- **A very large design** may not fit the copy made as the page goes away, so an instant reload can still lose its last stroke.
- **After a full page navigation straight after a rename,** My Studio can briefly show the old name.
- **After sign-out,** a direct database read with the old access token can still work until it expires, at most an hour (`docs/decisions.md`, 3 Nov).
- **The remaining decisions** keep these differences from the PRD: the input limits, no reset camera, pruned autosaves, a manual takedown, two pattern colours from ground and brush, no confirmation on unpublish, and the thin side-on view (`docs/decisions.md`, 2 Nov).
- **Stored renders** don't carry a template or compiler revision, which needs a migration (part of #179).
- **WebKit stands in for recent Safari.** Real iPhone Safari and Android aren't tested, and editing on phones isn't claimed (#191).
- **Local draft restore** re-imports on `@1`, so it loses the true-shape drawing. Cloud designs and their recovery aren't affected.
- **Owner items:** rights (#138), brand and product decisions (#198), the claims questions (#199), branch protection (#192), the operator for alerts (#193), and validation and pitch work (#196, #197, #200, #201).
