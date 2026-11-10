#!/usr/bin/env bash
# One backup, checked and encrypted (P1). Run by .github/workflows/backup.yml
# every night against the hosted project, and by CI against the local stack.
#
#   scripts/backup-encrypted.sh <out-dir>
#
# SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SECRET_KEY, SOURCE_SUPABASE_DB_URL
#     The project to back up. The DB URL must reach Postgres as a role that
#     can read auth, public and storage (hosted: the session pooler URI).
# CHECK_SUPABASE_URL, CHECK_SUPABASE_SECRET_KEY, CHECK_SUPABASE_DB_URL
#     A scratch Supabase stack to rehearse the restore on (CI's own local
#     stack). Nothing is ever restored into the source project.
# BACKUP_AGE_RECIPIENT
#     The age public key (age1…). Only its private key, kept offline by the
#     owner, can decrypt the result.
#
# Writes <out-dir>.tar.age and <out-dir>.tar.age.sha256, then deletes the
# unencrypted folder. Exits non-zero if the backup or its restore check fails;
# then nothing is written.

set -euo pipefail

out=${1:?usage: scripts/backup-encrypted.sh <out-dir>}

for name in SOURCE_SUPABASE_URL SOURCE_SUPABASE_SECRET_KEY SOURCE_SUPABASE_DB_URL \
  CHECK_SUPABASE_URL CHECK_SUPABASE_SECRET_KEY CHECK_SUPABASE_DB_URL BACKUP_AGE_RECIPIENT; do
  if [ -z "${!name:-}" ]; then
    echo "::error::$name is not set (docs/backup-restore.md, Automated backups)" >&2
    exit 1
  fi
done

case "$BACKUP_AGE_RECIPIENT" in
  age1*) ;;
  *) echo "::error::BACKUP_AGE_RECIPIENT is not an age public key (age1…)" >&2; exit 1 ;;
esac

cleanup() { rm -rf "$out"; }
trap cleanup EXIT

echo "== Backup"
SUPABASE_URL=$SOURCE_SUPABASE_URL SUPABASE_SECRET_KEY=$SOURCE_SUPABASE_SECRET_KEY SUPABASE_DB_URL=$SOURCE_SUPABASE_DB_URL \
  node scripts/backup.mjs "$out"

echo "== Restore check on the scratch stack"
SUPABASE_URL=$CHECK_SUPABASE_URL SUPABASE_SECRET_KEY=$CHECK_SUPABASE_SECRET_KEY SUPABASE_DB_URL=$CHECK_SUPABASE_DB_URL \
  node scripts/restore-check.mjs "$out"

echo "== Encrypt"
tar -C "$(dirname "$out")" -cf - "$(basename "$out")" | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" > "$out.tar.age"
(cd "$(dirname "$out")" && sha256sum "$(basename "$out").tar.age" > "$(basename "$out").tar.age.sha256")
ls -l "$out.tar.age"
