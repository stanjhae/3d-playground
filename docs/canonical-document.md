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

## Notes for the v1 import adapter (F06 #141)

- Points, `scale` and `rotation` keep the same numeric meaning as v1, so they copy across without conversion. Only the containers change: per-layer `panel` becomes `panels.<id>.layers`, and per-stroke `panel` moves into a paint layer on that panel.
- v1 `graphic.src` (a data URL or library path) must first become an uploaded asset (S01 #170). Legacy graphics get `aspect: 1`, which reproduces how they look today.
- v1 stroke pressure (`p`) is dropped. The renderer's default pressure of 0.7 is what v1 strokes without pressure already used.
- v1 `pattern` layers and locked `art` layers have no v2 equivalent. The adapter must report them rather than drop them silently.
- The F04 merge (#216) first documented y-down, degrees and panel-relative scale. Nothing ever persisted v2 documents, so F05 corrected these in place to match the renderer without bumping `schemaVersion`.
