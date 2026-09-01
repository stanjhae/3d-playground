#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
models="$root/public/models"
cli=(npx --yes @gltf-transform/cli@4.4.2)

"${cli[@]}" --version

compress_model() {
  local src="$1"
  shift
  local tmp="${src}.tmp.glb"

  echo "compressing $src"
  "${cli[@]}" optimize "$src" "$tmp" \
    --compress draco \
    --texture-compress webp \
    --simplify false \
    --join-named false \
    "$@"
  mv "$tmp" "$src"
  ls -lh "$src"
}

compress_model "$models/garment.glb" --flatten false --join false
