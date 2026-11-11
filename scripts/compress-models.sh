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

# Style3D forms are already compressed in public/models. To re-import one
# from its Sketchfab download (glTF Binary, 1k textures), seat it, simplify
# it only if it is over the GLB budget (scripts/budgets.json), then compress:
#
#   python3 scripts/ingest-garment.py --src <download.glb> --out public/models/<id>.glb \
#     --title "<Sketchfab title>" --href <source URL> [--map ...]
#   node scripts/simplify-parts.mjs --src public/models/<id>.glb --out public/models/<id>.glb [...]
#   compress_model "$models/<id>.glb" --flatten false --join false
#
# Recipes used on 11 Nov 2026:
#   hoodie    no --map, no simplify                                          681 KiB
#   overall   --map "mat2=hardware,mat4=hardware,mat15=hardware,mat16=hardware",
#             no simplify                                                    713 KiB
#   tailored  --map "mat4=hardware,mat5=hardware,mat6=hardware",
#             simplify --hardware-ratio 0.05 --hardware-error 0.01 --body-ratio 0.7
#                                                                           1149 KiB
