# Canonical document v2: coordinates, transforms and hashing

Covers F04 #139 and F05 #140. The code is in `src/lib/canonical-document.ts` (contract and validator) and `src/lib/canonical-hash.ts` (normalization and hashing). The golden example is `src/lib/canonical-fixtures.ts`.

The 2D document is the source of truth. The renderer, saves and publication all derive from it. Nothing in it has a physical unit: no centimetres, sizes or fit. It describes a print layout on a fixed template.

## Coordinates

| Quantity | Unit and range | Matches the renderer today |
| --- | --- | --- |
| Point `x`, `y` (layer centre, stroke points) | Panel-normalized `[0, 1]`. **Origin bottom-left, y up.** | `panelPointToUv` maps `y` straight to `v`, and atlas rows are `(1 − v) · height` |
| Object `scale` | Fraction of **atlas width**, `(0, 1]` | Text font size and image size are `scale × atlas width` |
| Stroke `width` | Fraction of atlas width, `[0.002, 0.25]` | Same meaning as v1 `stroke.width` |
| Base pattern `period` | Fraction of atlas width, `[0.02, 0.5]` | New in v2 |
| `rotation`, stripe `angle` | **Radians**, `(−π, π]`, stored as `(−3.141593, 3.141593]`. Positive turns clockwise on screen. | `context.rotate(rotation)` on a y-down canvas |

Each panel's print region is its UV rectangle in `DEFAULT_PANEL_UV`. Front and back are the upper half of the atlas; the sleeves are the lower half. The template version pins that mapping (F07 #142).

### Images: the aspect-ratio extension

An image layer stores `aspect = natural width / natural height`. The image is **contained** in a square whose side is `scale` (in atlas widths), centred on (`x`, `y`) and rotated about that centre (`imageBox`):

- `aspect ≥ 1`: width is `scale`, height is `scale / aspect`.
- `aspect < 1`: width is `scale × aspect`, height is `scale`.

`aspect = 1` reproduces the legacy renderer, which drew every graphic as a `scale × atlas width` square. So old square images look the same, and a non-square image never grows past the box a square one would occupy.

## Content hashing

`hashCanonicalDocument` returns `sha256:<hex>` over the UTF-8 bytes of `serializeCanonicalDocument`. The serialization:

1. normalizes strings to Unicode NFC;
2. rounds numbers to 6 decimals (`Math.round(n × 10⁶) / 10⁶`), writes `−0` as `0`, and rejects non-finite numbers;
3. sorts object keys by code unit and keeps array order (layer order is z-order, bottom first);
4. writes compact JSON with no whitespace.

Store the normalized form (`normalizeCanonicalDocument`), not the raw editor state. Then the hash is the same before save and after reload, and an identical revision is detectable by hash alone. The 6-decimal rounding is why the angle bound is 3.141593: raw π (3.14159265…) is valid and still valid after it rounds up.

Hash only a document that has passed `validateCanonicalDocument`. The validator rejects unknown fields, so no numeric-string keys can reorder the JSON.

## Example contract

`GOLDEN_DOCUMENT` has a striped base, a brush stroke and an eraser stroke on the front, a 3:2 image, and NFC text on the back. Its serialization hashes to:

```
sha256:e081116ffc8971eccb2c8b466f21bf289306bbec33a906e6bd173fc542843b56
```

`canonical-hash.test.ts` pins that value. Tests confirm the same hash for:
- a JSON save/reload round trip
- reordered keys
- decomposed text (`e` + combining accent)
- sub-precision numeric noise

Any visible content edit changes the hash. `shasum -a 256` over the serialized bytes produces the same digest, so the hash does not depend on JavaScript.

## Legacy v1 import (F06 #141)

`importLegacyDesign` in `src/lib/legacy-import.ts` reads a v1 document, an editor draft (`flv:draft:current`) or a snapshot (`flv:draft:mornings`). It never uses the permissive v1 parsers. Cloud saves accept only `validateCanonicalDocument`, and every import result passes it.

The adapter has three outcomes:
- **`warnings`:** content was imported, but something about it changed.
- **`unsupported`:** content was left out, each item with a path.
- **Rejection:** `corrupt`, `already-v2`, `unsupported-garment`, or `invalid` (the converted result failed v2 validation, for example because of duplicate IDs).

| v1 | v2 | Outcome |
| --- | --- | --- |
| `garmentId: 'tee'` | template `tee-crew-short@1` | Any other garment is rejected (`unsupported-garment`) |
| `garmentVersion` other than 2 | current template | Warning |
| `structural` other than neck `crew` and sleeve `short` | — | Unsupported |
| First `overrides[].color` | `base: solid` | Warning that names the material. Other part colors, `mapId`, `roughness` and `metalness` are unsupported. |
| Panel `sleeve` (before four panels) | `left` | Warning. **Documented mapping:** v1 had one sleeve panel that the renderer drew on the left sleeve's UV rectangle. |
| Paint layer | One paint layer per panel that has strokes | If the strokes span several panels, IDs get a `--<panel>` suffix |
| Brush and eraser strokes | Same tool; points flattened to `[x, y, …]` | Pressure is dropped (warning if any point differs from 0.7, the old default). Off-panel points are clamped exactly as the old renderer clamped them (warning). |
| `fill` stroke | — | Unsupported |
| Graphic | `image`, `aspect: 1` | Gets a reserved `asset_legacy_<sha256(src)[0:32]>` ID and is listed in `pendingAssets` for upload (S01 #170). Tint is dropped (warning). |
| Text | Text | All content is kept. A warning appears when it was longer than the 32 characters the old preview showed. Over 280 characters is unsupported. |
| `scale` out of `(0, 1]`, width out of range, too many points | — | Unsupported (clamping would change the look) |
| `rotation` | Same angle wrapped into `(−π, π]` | Lossless |
| `pattern` layer, locked `art` layer | — | Unsupported |

Placement (`x`, `y`, `scale`, `rotation`) copies across unchanged, so `panelPointToUv` gives the same atlas position before and after import.

**Never overwriting owned work.** Imports are deterministic: the same source always produces the same document, `contentHash` and `importKey`. `importKey` is a UUID (version-8 layout) derived from the SHA-256 of the original. Pass it as the `mutation_key` to `flp_create_design`, and a repeated import returns the design it already made, instead of creating a duplicate or overwriting anything. `backup` holds the exact original input so that it can be kept alongside the import.
