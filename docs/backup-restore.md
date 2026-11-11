# Backup, restore and rollback (Q09 #194, P1)

Scripts: `scripts/backup.mjs`, `scripts/restore-check.mjs` (shared code in `scripts/backup-lib.mjs`), `scripts/backup-encrypted.sh`. Workflow: `.github/workflows/backup.yml` (nightly). Tests: `src/lib/flp-api/backup-restore.integration.test.ts`, `src/lib/flp-api/backup.test.ts`, and the **Encrypted backup round trip** step of CI's *Database and API integration* job.

The procedure was first rehearsed on the **local** Supabase stack (Postgres 17.6 in Docker). Since P1 the same scripts also reach a hosted project over a connection URL, and a nightly workflow backs up the hosted project, database and storage. What still needs the owner (secrets, a key, plan features) and the one-off hosted rehearsal are in the two sections below. Anything not yet done on the hosted project is marked **not yet run on hosted**.

## Automated backups (nightly)

`.github/workflows/backup.yml` runs at 03:17 UTC every night (and on demand: Actions → Backup → Run workflow). It:

1. Starts a throwaway local Supabase stack on the runner, the scratch target for the restore check.
2. Dumps the hosted database over the **session pooler**: `pg_dump` 17, schemas `public`, `auth` and `storage`, in one exported snapshot (`scripts/backup.mjs` with `SUPABASE_DB_URL`).
3. Downloads **every storage object** in that snapshot's object list through the Storage API, with SHA-256 per object in `manifest.json`.
4. Runs the full restore check against the scratch stack: dump into `flp_restore`, objects into a new bucket there, checks (a)–(d). Nothing is written to the hosted project.
5. Encrypts the folder with [age](https://age-encryption.org) to the owner's public key, deletes the plaintext, and uploads `flp-<UTC time>.tar.age` with its `.sha256` as a workflow artifact, kept **30 days** (`BACKUP_RETENTION_DAYS`).
6. On failure, opens (or comments on) one `backup-alert` issue assigned to the owner; the next good run closes it.

The repository is public, so artifacts are downloadable by any signed-in GitHub user. That is why they are encrypted: without the private key the archive is noise. The key never touches GitHub.

CI runs the same `scripts/backup-encrypted.sh` on every PR against its own local stack, over a connection URL as the nightly job does, then decrypts with a throwaway key and checks the copy again. So a change that breaks backups fails the PR, not the next night.

### What the owner must enable

Until all four values exist, every nightly run fails and keeps the `backup-alert` issue open. That is on purpose: a backup that silently doesn't run is worse.

**Set for staging on 10 Nov 2026.** The four values point at the staging project (`izoiruqvblbvvscpfgek`). The database password contains characters that must be percent-encoded in the URI (an `@` becomes `%40`); the stored secret is encoded. Two manual runs passed every check: [42897551516](https://github.com/stanjhae/3d-playground/actions/runs/42897551516) (0 designs) and [42898113525](https://github.com/stanjhae/3d-playground/actions/runs/42898113525) (1 seeded design, 5 objects), and the second archive decrypted locally with the private key. The private key was made on the owner's machine and must live in the password manager.

| Where | Name | Value |
| --- | --- | --- |
| Settings → Secrets and variables → Actions → **Secrets** | `BACKUP_SUPABASE_URL` | `https://<ref>.supabase.co` of the project to back up |
| Secrets | `BACKUP_SUPABASE_SECRET_KEY` | That project's secret key (Settings → API). It downloads private files. |
| Secrets | `BACKUP_SUPABASE_DB_URL` | Dashboard → Connect → **Session pooler** URI (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`). Not the transaction pooler (port 6543): the snapshot needs one session. Not the direct host: it is IPv6-only and runners have no IPv6. |
| Settings → Secrets and variables → Actions → **Variables** | `BACKUP_AGE_RECIPIENT` | The age **public** key, `age1…` (below) |
| Variables (optional) | `BACKUP_RETENTION_DAYS` | Days to keep each archive; default 30, at most 90 on a public repository |

Make the key pair once, on the owner's own machine:

```bash
brew install age            # or apt install age
age-keygen -o flp-backup.key
```

It prints `Public key: age1…`; that goes in `BACKUP_AGE_RECIPIENT`. Store `flp-backup.key` in the team password manager and nowhere in the repository or GitHub. Losing it makes every archive unreadable; leaking it makes them all readable, so rotate it (new pair, new variable) if it ever leaves the password manager.

Then run **Actions → Backup → Run workflow** once and check the run summary shows the counts and "All checks passed".

Also on the Supabase side (Dashboard → Database → Backups), independent of this workflow:

- **Daily database backups** come with the Pro plan (7 days kept) and above; the Free plan has none. They cover the database only, never storage objects, which is why the workflow above exists.
- **Point-in-time recovery** is a paid add-on (Pro or higher, with at least a Small compute add-on). Turn it on before the alpha if losing up to a day of designs is not acceptable; the nightly archive alone can lose up to 24 hours.
- Scheduled workflows in a public repository are switched off after 60 days without commits. If the repository goes quiet, check Actions → Backup is still enabled.

### Restoring from a nightly archive

```bash
gh run download <run-id> -n flp-<UTC time>        # or download from the run page
sha256sum --check flp-<UTC time>.tar.age.sha256
age --decrypt --identity flp-backup.key flp-<UTC time>.tar.age | tar -xf -
# → flp-<UTC time>/ with database.dump, storage/ and manifest.json, as backup.mjs writes it
```

Then follow the hosted rehearsal below, or the failure runbook, with that folder.

## Hosted restore rehearsal

The restore check proves the archive is complete. This rehearsal proves the team can bring the service back on a **fresh hosted project**, and measures how long it takes there. Run it before the alpha (by Mon 30 Nov), then after any change to the schema's shape or the backup scripts, and at least once a quarter. **Not yet run on hosted:** it needs the owner's credentials and a scratch project, and nobody has run it yet. Write the results into the record table at the end.

Never point any step below at the live project except step 1, which only reads it.

1. **Take a fresh archive.** Actions → Backup → Run workflow. Download and decrypt it as above (`flp-<time>/`). Note the run's summary: designs, versions, objects, MB.
2. **Create a scratch project.** Dashboard → New project `flp-restore-rehearsal`, same region as staging (`eu-west-1`). The Free plan is enough. Save its database password. Note its URL, secret key and session pooler URI.
3. **Bring it to the same migrations.** From the main checkout at the commit the archive was taken on: `supabase db push --db-url "$REHEARSAL_DB_URL"`. Then paste the email template and auth settings from `docs/auth.md`, as for a new environment (`docs/deploy.md` step 3).
4. **Restore the data.** Time from here (the recovery time starts now):
   ```bash
   pg_restore --data-only --no-owner --disable-triggers \
     --schema=auth --schema=public --schema=storage \
     --dbname="$REHEARSAL_DB_URL" flp-<time>/database.dump
   ```
   `--disable-triggers` needs a superuser on some tables; if Supabase refuses it, rerun without it and note each table that failed. `storage.objects` rows arrive with the data. Rows the migrations already made (the `design-assets` bucket, `auth.schema_migrations`, `storage.migrations`) report duplicate keys; those errors are expected, anything else goes in the record.
5. **Restore the files to the real bucket name.** The bucket `design-assets` already exists from the migrations. Upload every file under `flp-<time>/storage/design-assets/` to the same path in the scratch project's `design-assets`, with its content type from `manifest.json`. The upload must overwrite the row the data restore made (upsert). A short script with `supabase-js` `upload(path, bytes, { upsert: true, contentType })` does it, or the Supabase CLI `supabase storage cp -r`.
6. **Check it.** Against the scratch project: `SUPABASE_URL=… SUPABASE_SECRET_KEY=… SUPABASE_DB_URL="$REHEARSAL_DB_URL" node scripts/restore-check.mjs flp-<time>`. This restores beside the data into `flp_restore` and a `flp-restore-*` bucket, and runs checks (a)–(d); if the pooler refuses `create database`, note it and use step 7 alone. Stop the clock when it passes.
7. **Check it as a person.** Point a local build at the scratch project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, server keys as in `docs/deploy.md`), sign in as a test account from the archive (codes arrive only if SMTP is set; otherwise use `E2E_CODE_SOURCE=admin` from `docs/e2e.md`), open a design, and open one published `/s/<slug>`: the pictures must show (their bytes must hash to `render_artifacts.sha256`).
8. **Clean up.** Delete the scratch project (it holds a copy of real accounts), and the decrypted folder (`rm -rf flp-<time>`).

**Record** (one row per rehearsal):

| Date | Who | Archive (run) | Designs / versions / objects / MB | Restore DB | Restore files | Checks | Recovery time (steps 4–6) | Problems found |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _not yet run_ | | | | | | | | |

What it does not cover: restoring *into the live project* after a partial loss. That is the "damaged rows" row of the failure runbook: restore into a scratch project as above, then copy the affected rows back with SQL.

## What has to be backed up

| Data | Where | In the database dump? |
| --- | --- | --- |
| Designs, versions, heads (`designs.head_seq`), publications, render rows, upload rows, profiles | `public` schema | Yes |
| Accounts | `auth` schema | Yes |
| Storage object **metadata** (`storage.objects`) | `storage` schema | Yes, as rows only |
| Uploaded images (`<owner>/<asset>/normalized`) and render files (`<owner>/<design>/v<seq>/<kind>.<ext>`) | `design-assets` bucket (private) | **No.** The bytes live in the storage backend, so they are backed up separately, object by object. |

A public render is served only if its bytes hash to `render_artifacts.sha256` (P02 #180). A restore that brings back rows without matching bytes therefore takes published looks offline rather than showing the wrong image. The restore check verifies exactly this.

## Procedure (local stack, or any project by URL)

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
- **(b) Published renders.** For every `published` publication, the three base views (`view_front`, `view_three_quarter`, `view_back`) have `ready` render rows, and so do the sleeve views (`view_left`, `view_right`) where the version has them. Versions published before #179 stay public without sleeves. Every ready view's restored bytes must hash to `render_artifacts.sha256`. The lists come from `src/lib/flp-api/render-kinds.mjs`, which the API uses too.
- **(c) Publication state.** Every publication has the slug, status and version it had at backup time; revoked ones point at no version, and tombstones of deleted designs stay revoked.
- **(d) Deleted designs.** The restored design ids are exactly the backed-up ones. A design that was not in the backup is reported as having reappeared.

**Recovery time** is create database + restore database + restore storage + verify. Backup integrity and cleanup are excluded.

## Measured times (local, 1 Nov 2026)

Apple Silicon laptop, Docker Desktop, local storage API. Times are from the scripts' own phase output.

| Dataset | Backup | Restore DB | Restore storage | Verify | **Recovery time** | Total check |
| --- | --- | --- | --- | --- | --- | --- |
| Local data as found: 3 designs, 7 versions, 4 objects (0.02 MB), 0.37 MB dump | 0.19 s | 0.32 s | 0.07 s | 0.36 s | **0.86 s** | 1.06 s |
| Scaled fixture: 30 accounts, 145 designs, 808 versions, 31 published and 10 revoked publications, 123 render rows, 193 objects (73.8 MB), 0.47 MB dump | 1.00 s (dump 0.19, storage 0.81) | 0.38 s | 1.71 s | 0.28 s | **2.44 s** | 2.66 s |
| Integration round trip (1 published with an upload, 1 published with only the three base views, 1 revoked, 1 deleted, plus a tampered rerun) | | | | | | 4.4 s for the suite |

All checks passed on both datasets. The scaled fixture was seeded through the real API handler (uploads, saves, renders, publish, revoke, delete), and the accounts were deleted afterwards.

**Reading the numbers.** Storage dominates: about 23 ms per MB for upload plus read-back on localhost. The database part is under half a second because the dump is small: content is capped at 2 MB per version and kept to 100 autosaves per design. Against a hosted project, storage transfer will be network-bound. Hosted times come from the hosted rehearsal (record table above) and must be measured there before any recovery time objective is promised.

## Gaps (known, not yet closed)

- **Hosted rehearsal not yet run.** The section above is the procedure; its record table is empty until the owner runs it. Hosted recovery times are unknown until then.
- ~~**Nightly backups need the owner's setup**~~ Done 10 Nov 2026 for staging (see "Set for staging" above). A production project, when there is one, needs its own four values.
- **Up to 24 hours can be lost** between nightly archives, unless point-in-time recovery is turned on in Supabase. PITR covers the database only; files uploaded since the last archive would still be missing.
- **Deletion and backups.** An account deleted from My Studio (or with `scripts/delete-account.mjs`) is gone from live data at once, but stays in archives taken before, for up to 30 days (`BACKUP_RETENTION_DAYS`), and in Supabase's own database backups for their retention (7 days on Pro). The privacy page says 30 days; if the retention is raised, change it there too.
- **The first hosted dump may need a tweak.** The hosted `postgres` role is not a superuser. If `pg_dump` is refused on a provider-owned table in `auth` or `storage`, the nightly run fails with its name; `FLP_DUMP_SCHEMAS` narrows the schemas, or exclude the one table in `backup-lib.mjs`.
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
- Before a risky migration, take a backup with `backup.mjs`. Hosted, run Actions → Backup → Run workflow (and, on Pro, check Supabase's own daily backup exists). Then run `restore-check.mjs` on it before applying the migration.

## Failure runbook

| Symptom | First step | Recovery |
| --- | --- | --- |
| A bad deploy (errors, broken UI), data fine | Promote the previous Vercel deployment | Fix forward and cut a new candidate |
| A migration broke a function or constraint | Promote the previous deployment if the app is down; it works on the additive schema | Write a forward migration that fixes it; never edit the applied file |
| A migration or bug damaged rows | Stop writes if the damage is spreading (take the app offline in Vercel) | Restore the latest checked backup into a separate database (`restore-check.mjs <dir> --keep`), copy the affected rows back with SQL, then run the check again on a new backup |
| Published look shows "not available" | `restore-check.mjs` on the latest backup; check (b) names the slug and view | Re-upload the render bytes from the backup to the same path; the hash must match `render_artifacts.sha256`, or the owner republishes |
| Uploaded image missing in the studio | Check (a) names the design and asset | Re-upload `<owner>/<asset>/normalized` from the backup (bytes must match `assets.sha256`) |
| Database lost (local volume or hosted project) | Create a fresh stack or project at the same migration version (`supabase db push` / `supabase start`) | Restore the dump's data (`pg_restore --data-only` for `auth`, `public`, `storage`), upload `storage/design-assets/*` to `design-assets` at the same paths, then run `restore-check.mjs` on a new backup. Hosted: the rehearsal steps 2–7 above. |
| Restore check fails on counts | Read the `pg_restore` warnings it printed | A schema mismatch usually means the dump is newer than the target: restore onto a stack with the same migrations |
| Leaked secret key | Rotate it in Supabase, update Vercel, redeploy (`docs/deploy.md`) | Backups made with the old key stay valid; keys are not stored in them |

Never run `supabase db reset` against a stack whose data isn't backed up and checked.
