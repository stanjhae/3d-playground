# Backup, restore and rollback (Q09 #194)

Scripts: `scripts/backup.mjs`, `scripts/restore-check.mjs` (shared code in `scripts/backup-lib.mjs`). Test: `src/lib/flp-api/backup-restore.integration.test.ts`.

Everything here was rehearsed on the **local** Supabase stack (Postgres 17.6 in Docker). There is no hosted project yet (#186). Anything that depends on the hosted provider is marked **pending #186**: it is planned, not yet claimed.

## What has to be backed up

| Data | Where | In the database dump? |
| --- | --- | --- |
| Designs, versions, heads (`designs.head_seq`), publications, render rows, upload rows, profiles | `public` schema | Yes |
| Accounts | `auth` schema | Yes |
| Storage object **metadata** (`storage.objects`) | `storage` schema | Yes, as rows only |
| Uploaded images (`<owner>/<asset>/normalized`) and render files (`<owner>/<design>/v<seq>/<kind>.<ext>`) | `design-assets` bucket (private) | **No.** The bytes live in the storage backend, so they are backed up separately, object by object. |

A public render is served only if its bytes hash to `render_artifacts.sha256` (P02 #180). A restore that brings back rows without matching bytes therefore takes published looks offline rather than showing the wrong image. The restore check verifies exactly this.

## Procedure

```bash
set -a; . ./.env.local; set +a          # SUPABASE_URL, SUPABASE_SECRET_KEY
node scripts/backup.mjs                  # → backups/flp-<timestamp>/
node scripts/restore-check.mjs backups/flp-<timestamp>
```

### `backup.mjs [out-dir]`

1. Opens a `repeatable read` transaction in the `supabase_db_*` container and exports its snapshot.
2. Runs `pg_dump --format=custom --snapshot=…` inside the container (`docker exec`), writing `database.dump`.
3. In the same snapshot, records the expected state: row counts, every design id, every publication's slug, status and version, and the list of storage objects.
4. Downloads every listed object through the Storage API (secret key) to `storage/<bucket>/<path>`.
5. Writes `manifest.json`: the dump's size and SHA-256, the expected state, each object's path, size, content type and SHA-256, and the phase times.

The dump and the object list come from one snapshot, so the manifest describes exactly what the dump holds. An object deleted between the snapshot and its download is recorded under `storage.missing` and reported by the restore check.

The folder holds private user data (accounts, designs, uploads). Keep it out of git (`/backups/` is ignored) and off shared drives.

Overrides: `FLP_DB_CONTAINER` (if more than one `supabase_db_*` container is running) and `FLP_DB_USER` (default `supabase_admin`, the superuser in the container; `postgres` cannot dump `auth`).

### `restore-check.mjs <backup-dir> [--verify-only] [--keep]`

Restores beside the live data and never writes to it:

| Phase | What happens |
| --- | --- |
| backup integrity | Re-hashes the dump and every object file against the manifest |
| create database | `drop database if exists flp_restore; create database flp_restore` in the same container |
| restore database | `pg_restore --no-owner` of the dump into `flp_restore`. Any `pg_restore` error is printed as a warning; the row counts below decide pass or fail. |
| restore storage | Creates a new private bucket `flp-restore-<id>`, uploads every object under `<bucket>/<path>` and reads each one back. `--verify-only` skips this and checks the backup folder's bytes instead. |
| verify | The checks below, against `flp_restore` and the restored bytes |
| cleanup | Drops `flp_restore` and empties and deletes the restore bucket (`--keep` leaves both for inspection) |

**Checks.** A failed check prints `FAIL`, and the script exits 1.

- **Counts.** Every table in the manifest has the same number of rows after the restore: accounts, designs, versions, publications, render rows, uploads and storage objects.
- **(a) Source content.** Every design's head version exists. For every version, the content hash is recomputed from the stored JSON (the same normalization as `src/lib/canonical-hash.ts`; a unit test keeps them equal) and `content_bytes` is re-measured. Every uploaded image a version uses is a `ready` row whose restored bytes match `assets.sha256`.
- **(b) Published renders.** For every `published` publication, each public view (`view_front`, `view_three_quarter`, `view_back`) has a `ready` render row, and its restored bytes hash to `render_artifacts.sha256`.
- **(c) Publication state.** Every publication has the slug, status and version it had at backup time; revoked ones point at no version, and tombstones of deleted designs stay revoked.
- **(d) Deleted designs.** The restored design ids are exactly the backed-up ones. A design that was not in the backup is reported as having reappeared.

**Recovery time** is create database + restore database + restore storage + verify. Backup integrity and cleanup are excluded.

## Measured times (local, 1 Nov 2026)

Apple Silicon laptop, Docker Desktop, local storage API. Times are from the scripts' own phase output.

| Dataset | Backup | Restore DB | Restore storage | Verify | **Recovery time** | Total check |
| --- | --- | --- | --- | --- | --- | --- |
| Local data as found: 3 designs, 7 versions, 4 objects (0.02 MB), 0.37 MB dump | 0.19 s | 0.32 s | 0.07 s | 0.36 s | **0.86 s** | 1.06 s |
| Scaled fixture: 30 accounts, 145 designs, 808 versions, 31 published and 10 revoked publications, 123 render rows, 193 objects (73.8 MB), 0.47 MB dump | 1.00 s (dump 0.19, storage 0.81) | 0.38 s | 1.71 s | 0.28 s | **2.44 s** | 2.66 s |
| Integration round trip (1 published with an upload, 1 revoked, 1 deleted, plus a tampered rerun) | | | | | | 4.4 s for the suite |

All checks passed on both datasets. The scaled fixture was seeded through the real API handler (uploads, saves, renders, publish, revoke, delete), and the accounts were deleted afterwards.

**Reading the numbers.** Storage dominates: about 23 ms per MB for upload plus read-back on localhost. The database part is under half a second because the dump is small: content is capped at 2 MB per version and kept to 100 autosaves per design. Against a hosted project, storage transfer will be network-bound. Hosted times are **pending #186** and must be re-measured there before any recovery time objective is promised.

## Gaps (known, not yet closed)

- **Hosted backups: pending #186.** Point-in-time recovery, the provider's daily backups, their retention, and how long deleted data stays recoverable in provider backups are all properties of the hosted plan. None is claimed until #186 picks the project and plan.
- **Storage is not in provider database backups.** Even with hosted backups, bucket objects need this script, or provider object versioning (**pending #186**), run on a schedule. Nothing runs it automatically yet; the schedule and where backups are kept are **pending #186**.
- **Deletion and backups.** An account deleted with `scripts/delete-account.mjs` is gone from live data at once, but stays in any backup taken before. How long backups are kept (and so how long deleted data lingers in them) is **pending #186**, and the privacy page must not promise less.
- **Restoring over a live project is not rehearsed.** The check restores into a separate database, which proves the dump and bytes are complete and consistent. A real recovery into a fresh hosted project (migrations, then data, then re-uploading objects to `design-assets`) depends on the hosted target and is **pending #186**. The runbook below gives the intended order.
- **Leftover render files.** The scaled run found render files of 10 deleted designs, all from integration runs (the API's own delete removes them). They are unreachable, because no row points at them. The restore check lists them as a warning, and `scripts/cleanup-orphans.mjs --delete` removes them.
- **Local stack has no backup of its own.** When this rehearsal started, Docker Desktop had no containers or volumes, and the local stack had to be recreated. Take a backup before resetting Docker or the stack.

## App rollback

The app is stateless on Vercel, so rolling back code never touches data:

1. Vercel → Project → Deployments → pick the last good production deployment → **Promote to Production** (or **Instant Rollback**). It is live within seconds, with the same environment variables.
2. Or redeploy the previous release tag (`git checkout v<previous>` and `vercel --prod`), or `git revert` the offending merge and cut a new candidate (`docs/release.md`).
3. Check: `/` loads, sign-in works, a published look `/s/<slug>` serves its image, and `GET /api/flp/designs` returns 200 for a signed-in account.

An older build must work against the current schema. Migrations only add things (next section), so the previous build keeps working.

## Forward-only migrations

- Migrations in `supabase/migrations/` are applied in order and **never edited once applied**. A fix is a new migration (`docs/deploy.md`, `docs/release.md`).
- Each migration is **additive**: new tables, columns with defaults, new functions or new versions of functions. Dropping or renaming something the previous build uses waits until no deployed build uses it, in a later release.
- **No down migrations.** Undoing a change is a new forward migration. If a migration damaged data, restore the affected rows from a backup checked with this procedure; don't roll back the schema.
- Before a risky migration, take a backup with `backup.mjs`. Hosted, also take a provider backup (**pending #186**). Then run `restore-check.mjs` on it before applying the migration.

## Failure runbook

| Symptom | First step | Recovery |
| --- | --- | --- |
| A bad deploy (errors, broken UI), data fine | Promote the previous Vercel deployment | Fix forward and cut a new candidate |
| A migration broke a function or constraint | Promote the previous deployment if the app is down; it works on the additive schema | Write a forward migration that fixes it; never edit the applied file |
| A migration or bug damaged rows | Stop writes if the damage is spreading (take the app offline in Vercel) | Restore the latest checked backup into a separate database (`restore-check.mjs <dir> --keep`), copy the affected rows back with SQL, then run the check again on a new backup |
| Published look shows "not available" | `restore-check.mjs` on the latest backup; check (b) names the slug and view | Re-upload the render bytes from the backup to the same path; the hash must match `render_artifacts.sha256`, or the owner republishes |
| Uploaded image missing in the studio | Check (a) names the design and asset | Re-upload `<owner>/<asset>/normalized` from the backup (bytes must match `assets.sha256`) |
| Database lost (local volume or hosted project) | Create a fresh stack or project at the same migration version (`supabase db push` / `supabase start`) | Restore the dump's data (`pg_restore --data-only` for `auth`, `public`, `storage`), upload `storage/design-assets/*` to `design-assets` at the same paths, then run `restore-check.mjs` on a new backup. The hosted variant is **pending #186**. |
| Restore check fails on counts | Read the `pg_restore` warnings it printed | A schema mismatch usually means the dump is newer than the target: restore onto a stack with the same migrations |
| Leaked secret key | Rotate it in Supabase, update Vercel, redeploy (`docs/deploy.md`) | Backups made with the old key stay valid; keys are not stored in them |

Never run `supabase db reset` against a stack whose data isn't backed up and checked.
