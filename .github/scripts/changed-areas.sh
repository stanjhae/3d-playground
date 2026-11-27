#!/usr/bin/env bash
# Prints which parts of the repo a pull request touches, as GitHub step
# outputs: `web=true|false` (the site, its browser journeys) and
# `db=true|false` (migrations, the API and its database tests).
#
# Anything shared (CI itself, migrations, workspace packages, the lockfile,
# the root package files) counts as both, so a change that could affect
# everything tests everything. Outside a pull request everything runs.
set -euo pipefail

if [ "${EVENT:-}" != "pull_request" ]; then
  echo "web=true"
  echo "db=true"
  exit 0
fi

files=$(git diff --name-only "${BASE_SHA:?}...${HEAD_SHA:?}")
echo "Changed files:" >&2
echo "$files" >&2

shared='^(\.github/|supabase/|packages/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$)'

touches() {
  if grep -qE "$1" <<<"$files"; then echo true; else echo false; fi
}

echo "web=$(touches "${shared}|^apps/web/")"
echo "db=$(touches "${shared}|^apps/web/(api|scripts|src/lib)/")"
